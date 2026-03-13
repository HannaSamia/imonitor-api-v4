import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { ExportHelperService } from '../../../shared/services/export-helper.service';
import { CoreTraceTracker, TraceTrackerStatus } from '../../../database/entities/core-trace-tracker.entity';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { generateGuid } from '../../../shared/helpers/common.helper';
import {
  TraceSystemConfigDTO,
  AirDownloadableDTO,
  ITextToFile,
  CustomerCareBasicResponse,
  TabularHeaderDto,
} from '../interfaces';

/** Remote path for AIR trace event logs */
const AIR_LOG_PATH = '/var/opt/fds/logs';

/** Maximum trace size before requiring a download link (4 MB) */
const MAX_TRACE_SIZE_BYTES = 4 * 1024 * 1024;

/** Default header configuration for tabular columns */
const headerDefault = {
  cellsalign: 'left',
  align: 'left',
  filtertype: 'textbox',
  filtercondition: 'CONTAINS',
};

/** Routes to trace in the AddTarget/RemoveTarget XML request for AIR nodes */
const AIR_TRACE_ROUTES = [
  'AUV-AccountAdmin',
  'AUV-AccountAdminExt',
  'AUV-Adjustment',
  'AUV-AirDataRecords',
  'AUV-AirMapServerIf',
  'AUV-CommonNotifHandler',
  'AUV-OSGiFrameworkLauncher',
  'AUV-Refill',
  'AUV-RpcAccountManagementClientIf',
  'AUV-ServiceClassAdmin',
  'AUV-XmlRpcVoucherUsageClientIf',
  'FSC-AccountFinderClientIf',
  'FSC-AirXmlRpc',
  'FSC-BatchFileInterface',
];

/**
 * Service for AIR trace management: set/unset/fetch/export traces via SSH/SFTP.
 * Mirrors v3 customerCare.service.ts lines 2009-2481.
 */
@Injectable()
export class CustomerCareAirTraceService {
  private readonly logger = new Logger(CustomerCareAirTraceService.name);

  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly dateHelperService: DateHelperService,
    private readonly legacyDataDbService: LegacyDataDbService,
    private readonly exportHelperService: ExportHelperService,
    private readonly configService: ConfigService,
    @InjectRepository(CoreTraceTracker)
    private readonly traceTrackerRepo: Repository<CoreTraceTracker>,
  ) {}

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /**
   * Set an AIR trace for a given MSISDN across all live AIR nodes.
   * Mirrors v3 lines 2009-2158: for each AIR node, SFTP upload request XML + shell script,
   * execute via SSH, check result, clean up remote files.
   */
  async setAirTrace(msisdn: string, currentUserId: string): Promise<void> {
    const credentials = await this.getAirNodeCredentials();
    if (!credentials.length) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_SSH_FAILED);
    }

    const requestXml = this.buildAirTraceRequestXml('AddTarget', msisdn);
    const totalNodes = credentials.length;

    let airPathNotFoundCount = 0;
    let sshFailures = 0;
    let fileUploadFailures = 0;
    let setTraceErrorsCount = 0;

    for (const cred of credentials) {
      const uniqueId = generateGuid();
      const shContent = `FDSRequestSender -u ${cred.gui_user} -p ${cred.gui_pass} ${uniqueId}_request.tmp`;

      try {
        const success = await this.executeAirTraceOnNode(cred, requestXml, shContent, uniqueId);
        if (!success) {
          setTraceErrorsCount++;
        }
      } catch (error) {
        const errMsg = (error as Error).message || '';
        if (errMsg.includes('PATH_NOT_FOUND')) {
          airPathNotFoundCount++;
        } else if (errMsg.includes('SSH_FAILED')) {
          sshFailures++;
        } else if (errMsg.includes('UPLOAD_FAILED')) {
          fileUploadFailures++;
        } else {
          setTraceErrorsCount++;
        }
      }
    }

    // If ALL nodes failed for a given category, throw appropriate error
    if (airPathNotFoundCount === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_AIR_PATH_NOT_FOUND);
    }
    if (sshFailures === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_SSH_FAILED);
    }
    if (fileUploadFailures === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_UPLOAD_FAILED);
    }
    if (setTraceErrorsCount === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_ERROR_SETTING_TRACE);
    }

    await this.trackTrace('set', 'AIR', msisdn, currentUserId);
  }

  /**
   * Unset an AIR trace for a given MSISDN across all live AIR nodes.
   * Same as setAirTrace but with RemoveTarget operation.
   * Mirrors v3 lines 2009-2158 (with RemoveTarget).
   */
  async unsetAirTrace(msisdn: string, currentUserId: string): Promise<void> {
    const credentials = await this.getAirNodeCredentials();
    if (!credentials.length) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_SSH_FAILED);
    }

    const requestXml = this.buildAirTraceRequestXml('RemoveTarget', msisdn);
    const totalNodes = credentials.length;

    let airPathNotFoundCount = 0;
    let sshFailures = 0;
    let fileUploadFailures = 0;
    let setTraceErrorsCount = 0;

    for (const cred of credentials) {
      const uniqueId = generateGuid();
      const shContent = `FDSRequestSender -u ${cred.gui_user} -p ${cred.gui_pass} ${uniqueId}_request.tmp`;

      try {
        const success = await this.executeAirTraceOnNode(cred, requestXml, shContent, uniqueId);
        if (!success) {
          setTraceErrorsCount++;
        }
      } catch (error) {
        const errMsg = (error as Error).message || '';
        if (errMsg.includes('PATH_NOT_FOUND')) {
          airPathNotFoundCount++;
        } else if (errMsg.includes('SSH_FAILED')) {
          sshFailures++;
        } else if (errMsg.includes('UPLOAD_FAILED')) {
          fileUploadFailures++;
        } else {
          setTraceErrorsCount++;
        }
      }
    }

    if (airPathNotFoundCount === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_AIR_PATH_NOT_FOUND);
    }
    if (sshFailures === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_SSH_FAILED);
    }
    if (fileUploadFailures === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_UPLOAD_FAILED);
    }
    if (setTraceErrorsCount === totalNodes) {
      throw new BadRequestException(ErrorMessages.CC_ERROR_SETTING_TRACE);
    }

    await this.trackTrace('unset', 'AIR', msisdn, currentUserId);
  }

  /**
   * Fetch AIR trace data between two time points for a given MSISDN.
   * Mirrors v3 lines 2314-2391: validate range, grep remote log files, process output.
   *
   * @param fromTime Start time in yyyy-MM-dd HH:mm:ss format
   * @param toTime End time in yyyy-MM-dd HH:mm:ss format
   * @param msisdn Phone number to filter
   * @param baseUrl Optional API base URL for generating download links when trace is too large
   * @returns Trace data with optional download URL if too large
   */
  async fetchAirTrace(fromTime: string, toTime: string, msisdn: string, baseUrl?: string): Promise<AirDownloadableDTO> {
    this.validateTraceTimeRange(fromTime, toTime);

    // Format times: strip last 2 chars (seconds) after adjustment
    const adjFrom = this.dateTimeAdjuster(fromTime).slice(0, -2);
    const adjTo = this.dateTimeAdjuster(toTime).slice(0, -2);

    const credentials = await this.getAirNodeCredentials();
    if (!credentials.length) {
      throw new BadRequestException(ErrorMessages.CC_SFTP_SSH_FAILED);
    }

    // Build the grep command for AIR trace logs
    const grepCommand =
      `cat ${AIR_LOG_PATH}/TraceEventLogFile.* | grep ${msisdn} | ` +
      `awk -F"[" '{print substr($2,1,8)substr($2,10,2)substr($2,13,2),";:;"$0}' | sort | ` +
      `awk -v T1=${adjFrom} -v T2=${adjTo} -F";:;" '($1>=T1 && $1<=T2){print $2}'`;

    let combinedOutput = '';
    let errorCount = 0;

    for (const cred of credentials) {
      if (!cred.ip_address || !cred.ssh_user || !cred.ssh_pass) {
        errorCount++;
        continue;
      }
      try {
        const result = await this.executeSshCommand(cred.ip_address, cred.ssh_user, cred.ssh_pass, grepCommand);
        if (result) {
          combinedOutput += this.processRawTrace(result, msisdn);
        }
      } catch {
        errorCount++;
      }
    }

    if (errorCount === credentials.length) {
      throw new BadRequestException(ErrorMessages.CC_TRACE_DATA_FAILURE);
    }

    let result = combinedOutput;
    if (!result || !result.trim()) {
      result = '<span>No trace was found!</span>';
    }

    // Check size: if baseUrl provided and size exceeds 4MB, return download URL
    const sizeBytes = Buffer.byteLength(result, 'utf-8');
    if (baseUrl && sizeBytes > MAX_TRACE_SIZE_BYTES) {
      const downloadUrl = `${baseUrl}/api/v1/operations/trace/air/download/${fromTime}/${toTime}/${msisdn}`;
      return { data: downloadUrl, downloadUrl };
    }

    return { data: result };
  }

  /**
   * Export AIR trace as an HTML file.
   * Mirrors v3 lines 2393-2412: fetch trace, check size, export to HTML.
   *
   * @throws BadRequestException if trace is too large (>4MB) — includes download URL in message
   */
  async exportAirTraceHtml(fromTime: string, toTime: string, msisdn: string, baseUrl?: string): Promise<string> {
    const traceResult = await this.fetchAirTrace(fromTime, toTime, msisdn, baseUrl);

    if (traceResult.downloadUrl) {
      throw new BadRequestException(`${ErrorMessages.CC_TRACE_TOO_LARGE} ${traceResult.downloadUrl}`);
    }

    return this.exportHelperService.exportHtml(traceResult.data);
  }

  /**
   * Download AIR trace as a text file (no size check).
   * Mirrors v3 lines 2414-2422.
   */
  async downloadAirTrace(fromTime: string, toTime: string, msisdn: string): Promise<ITextToFile> {
    const traceResult = await this.fetchAirTrace(fromTime, toTime, msisdn);
    return {
      content: traceResult.data,
      fileName: `trace_${fromTime}_${toTime}`,
    };
  }

  /**
   * Fetch trace history for a given date range.
   * Mirrors v3 lines 2424-2449: raw SQL query with DATE_FORMAT and LEFT JOIN.
   */
  async fetchTraceHistory(fromDate: string, toDate: string): Promise<CustomerCareBasicResponse> {
    const coreDb = this.configService.get<string>('DB_CORE_NAME', 'iMonitorV3_1');

    const formattedFrom = this.dateHelperService.formatDate('yyyy-MM-dd HH:mm:ss', new Date(fromDate));
    const formattedTo = this.dateHelperService.formatDate('yyyy-MM-dd HH:mm:ss', new Date(toDate));

    const sql = `
      SELECT t.node, t.status, t.phoneNumber,
        DATE_FORMAT(t.createdAt, '%Y-%m-%d %H:%i:%s') as createdAt,
        u.userName as CreatedBy
      FROM \`${coreDb}\`.core_trace_tracker t
      LEFT JOIN \`${coreDb}\`.core_application_users u ON t.createdby = u.id
      WHERE t.createdAt >= ? AND t.createdAt <= ?
    `;

    const rows = await this.traceTrackerRepo.query(sql, [formattedFrom, formattedTo]);
    const body = rows as Record<string, unknown>[];

    const header = body.length > 0 ? this.generateHeader(body[0]) : [];

    return { header, body };
  }

  /**
   * Fetch currently traced phone numbers (latest record per phoneNumber where status = 'set').
   * Mirrors v3 lines 2452-2481.
   */
  async fetchTracedNumbers(): Promise<CustomerCareBasicResponse> {
    const coreDb = this.configService.get<string>('DB_CORE_NAME', 'iMonitorV3_1');

    const sql = `
      SELECT t.phoneNumber, t.node,
        DATE_FORMAT(t.createdAt, '%Y-%m-%d %H:%i:%s') as setAt,
        u.userName as setBy
      FROM \`${coreDb}\`.core_trace_tracker t
      INNER JOIN (
        SELECT phoneNumber, MAX(createdAt) AS latestTime
        FROM \`${coreDb}\`.core_trace_tracker
        WHERE status != 'fetch'
        GROUP BY phoneNumber
      ) AS latestRecords ON t.phoneNumber = latestRecords.phoneNumber AND t.createdAt = latestRecords.latestTime
      LEFT JOIN \`${coreDb}\`.core_application_users u ON t.createdby = u.id
      WHERE t.status = 'set'
    `;

    const rows = await this.traceTrackerRepo.query(sql);
    const body = rows as Record<string, unknown>[];

    const header = body.length > 0 ? this.generateHeader(body[0]) : [];

    return { header, body };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Get all live AIR node credentials from iMonitorData.
   * Queries V3_air_nodes with AES_DECRYPT for passwords.
   */
  private async getAirNodeCredentials(): Promise<TraceSystemConfigDTO[]> {
    const coreDb = this.configService.get<string>('DB_CORE_NAME', 'iMonitorV3_1');
    const dataDb = this.configService.get<string>('DB_DATA_NAME', 'iMonitorData');

    const encKeySubQuery = `SELECT confVal FROM \`${coreDb}\`.core_sys_config WHERE confKey = ?`;

    const query = `
      SELECT ssh_user,
        AES_DECRYPT(ssh_pass, (${encKeySubQuery})) AS ssh_pass,
        ip_address, gui_user,
        AES_DECRYPT(gui_pass, (${encKeySubQuery})) AS gui_pass
      FROM \`${dataDb}\`.V3_air_nodes
      WHERE is_live = 1
    `;

    return this.legacyDataDbService.query<TraceSystemConfigDTO>(query, [
      SystemKeys.aesEncryptionKey,
      SystemKeys.aesEncryptionKey,
    ]);
  }

  /**
   * Record a trace set/unset operation in core_trace_tracker.
   */
  private async trackTrace(status: 'set' | 'unset', node: string, phoneNumber: string, userId: string): Promise<void> {
    const entry = this.traceTrackerRepo.create({
      status: status === 'set' ? TraceTrackerStatus.SET : TraceTrackerStatus.UNSET,
      node,
      phoneNumber,
      createdAt: new Date(),
      createdby: userId,
    });
    await this.traceTrackerRepo.save(entry);
  }

  /**
   * Process raw trace output into HTML with MSISDN highlighting.
   * Same pattern as SDP trace service:
   * - Splits by `|`
   * - Escapes HTML entities
   * - Highlights MSISDN in red
   * - Makes `Module:` lines bold
   * - Makes `Info: Provider:` lines bold with red provider name
   */
  private processRawTrace(text: string, msisdn: string): string {
    const lines = text.split('|');
    let result = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // Escape HTML entities
      let processed = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Highlight MSISDN in red
      if (msisdn) {
        const msisdnRegex = new RegExp(msisdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        processed = processed.replace(msisdnRegex, `<span style="color:red">${msisdn}</span>`);
      }

      // Bold Module: lines (without Provider info)
      if (/Module:/.test(processed) && !/Provider:/.test(processed)) {
        processed = `<b>${processed}</b>`;
      }

      // Bold Info: Provider: lines with red provider name
      if (/Info:\s*Provider:/.test(processed)) {
        processed = processed.replace(/(Provider:\s*)([^\s<]+)/, '$1<span style="color:red"><b>$2</b></span>');
        processed = `<b>${processed}</b>`;
      }

      result += processed + '<br>';
    }

    return result;
  }

  /**
   * Build the AddTarget or RemoveTarget XML request for AIR FDSRequestSender.
   * Contains the 14 standard AIR routes.
   */
  private buildAirTraceRequestXml(operation: 'AddTarget' | 'RemoveTarget', msisdn: string): string {
    const routes = AIR_TRACE_ROUTES.map((r) => `    <Route>${r}</Route>`).join('\n');
    return (
      `<?xml version='1.0' encoding='ISO-8859-1' standalone='no'?>\n` +
      `<Request Operation="${operation}" SessionId="Gi6OAmyi" Origin="GUI" MO="TraceEventLog">\n` +
      `    <Target>${msisdn}</Target>\n` +
      `${routes}\n` +
      `</Request>`
    );
  }

  /**
   * Remove dashes, T, colons, spaces from a date string and pad to 14 chars.
   * Mirrors v3 dateTimeAdjuster exactly.
   */
  private dateTimeAdjuster(dateStr: string): string {
    return dateStr
      .replace(/[-T: ]/g, '')
      .substring(0, 14)
      .padEnd(14, '0');
  }

  /**
   * Validate that the trace time range does not exceed 10 minutes.
   */
  private validateTraceTimeRange(fromTime: string, toTime: string): void {
    const from = new Date(fromTime);
    const to = new Date(toTime);
    const diffMinutes = this.dateHelperService.differenceInMinutes(to, from);

    if (diffMinutes > 10) {
      throw new BadRequestException('Time difference should not exceed 10 minutes');
    }
  }

  /**
   * Execute SSH command on a remote host.
   * Uses dynamic import of ssh2-promise for remote command execution.
   */
  private async executeSshCommand(
    host: string,
    username: string,
    password: string,
    command: string,
  ): Promise<string | null> {
    try {
      const SSH2Promise = (await import('ssh2-promise')).default;
      const ssh = new SSH2Promise({
        host,
        username,
        password,
        tryKeyboard: true,
        reconnect: false,
        readyTimeout: 30000,
      });
      const result = await ssh.exec(command);
      await ssh.close();
      return result || null;
    } catch (error) {
      this.logger.error(`SSH command failed on ${host}`, (error as Error).stack);
      return null;
    }
  }

  /**
   * Generic SFTP helper that opens SSH+SFTP, runs a callback, and cleans up.
   */
  private async sftpOperations(
    host: string,
    username: string,
    password: string,
    operations: (sftp: unknown) => Promise<void>,
  ): Promise<void> {
    const SSH2Promise = (await import('ssh2-promise')).default;
    const ssh = new SSH2Promise({
      host,
      username,
      password,
      tryKeyboard: true,
      reconnect: false,
      readyTimeout: 30000,
    });
    try {
      const sftp = ssh.sftp();
      await operations(sftp);
    } finally {
      await ssh.close().catch(() => {});
    }
  }

  /**
   * Execute AIR trace on a single node: SFTP upload request + shell files,
   * SSH exec shell script, check result, SFTP cleanup.
   *
   * @returns true if trace was set/unset successfully on this node
   * @throws Error with message containing PATH_NOT_FOUND, SSH_FAILED, or UPLOAD_FAILED
   */
  private async executeAirTraceOnNode(
    credentials: TraceSystemConfigDTO,
    requestXml: string,
    shContent: string,
    uniqueId: string,
  ): Promise<boolean> {
    const { ip_address: host, ssh_user: username, ssh_pass: password } = credentials;

    if (!host || !username || !password) {
      throw new Error('SSH_FAILED');
    }

    const requestTmpFile = `${uniqueId}_request.tmp`;
    const requestShFile = `${uniqueId}_request.sh`;
    const requestLogFile = `${uniqueId}_request.log`;

    let remoteCwd: string;

    // Step 1: Connect via SFTP, get working directory, upload files
    try {
      const SSH2Promise = (await import('ssh2-promise')).default;
      const ssh = new SSH2Promise({
        host,
        username,
        password,
        tryKeyboard: true,
        reconnect: false,
        readyTimeout: 30000,
      });

      try {
        const sftp = ssh.sftp();

        // Get remote working directory
        remoteCwd = await sftp.realpath('.');
        if (!remoteCwd) {
          throw new Error('PATH_NOT_FOUND');
        }

        const remoteTmpPath = `${remoteCwd}/${requestTmpFile}`;
        const remoteShPath = `${remoteCwd}/${requestShFile}`;
        const remoteLogPath = `${remoteCwd}/${requestLogFile}`;

        // Upload request XML and shell script
        try {
          await sftp.writeFile(remoteTmpPath, requestXml, 'utf-8');
          await sftp.writeFile(remoteShPath, shContent, 'utf-8');
        } catch {
          throw new Error('UPLOAD_FAILED');
        }

        // Execute shell script via SSH exec
        const execCommand =
          `/usr/bin/bash ${remoteShPath} > ${remoteLogPath} && ` +
          `cat ${remoteLogPath} | egrep "<Response></Response>" | wc -l`;

        let execResult: string | null = null;
        try {
          execResult = await ssh.exec(execCommand);
        } catch {
          // Execution failed — will be treated as trace error
        }

        // Clean up remote files (fire-and-forget)
        try {
          await sftp.unlink(remoteTmpPath);
        } catch {
          /* ignore cleanup errors */
        }
        try {
          await sftp.unlink(remoteShPath);
        } catch {
          /* ignore cleanup errors */
        }
        try {
          await sftp.unlink(remoteLogPath);
        } catch {
          /* ignore cleanup errors */
        }

        // Check if output is '1' (success)
        const trimmedResult = execResult?.trim();
        return trimmedResult === '1';
      } finally {
        await ssh.close().catch(() => {});
      }
    } catch (error) {
      const errMsg = (error as Error).message || '';
      if (errMsg.includes('PATH_NOT_FOUND') || errMsg.includes('UPLOAD_FAILED')) {
        throw error;
      }
      // Any other connection/SSH error
      throw new Error('SSH_FAILED');
    }
  }

  /**
   * Build tabular header from an object's keys with camelCase split and capitalize.
   * E.g. 'phoneNumber' becomes header 'Phone Number', field 'phoneNumber'.
   */
  private generateHeader(data: Record<string, unknown>): TabularHeaderDto[] {
    return Object.keys(data).map((key) => {
      // Split camelCase into words and capitalize each
      const headerText = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();

      return {
        header: headerText,
        field: key,
        ...headerDefault,
      };
    });
  }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { ExportHelperService } from '../../../shared/services/export-helper.service';
import { CoreTraceTracker, TraceTrackerStatus } from '../../../database/entities/core-trace-tracker.entity';
import { SystemKeys } from '../../../shared/constants';
import { ErrorMessages } from '../../../shared/constants/error-messages';
import { generateGuid, ensureDirCreation } from '../../../shared/helpers/common.helper';
import { TraceSystemConfigDTO } from '../interfaces';

const SDP_REMOTE_PATH = '/opt/fds/';
const SDP_LOG_PATH = '/var/opt/fds/logs';

/** FDSRequestSender PATH export for SDP nodes */
const PATH_EXPORT =
  'PATH=/opt/EABpython/bin:/usr/bin:/usr/sbin:/usr/dt/bin:/usr/sfw/bin:/usr/openwin/bin:/opt/EABfds/bin:/opt/EABcsutls/bin:/opt/EABcsConfig/bin:/opt/EABfdslic/bin:/opt/TimesTen/bin:/opt/EABcss7uthd/bin:/opt/sign/EABss7024/bin:/opt/sign/EABss7023/bin; export PATH';

/** FDSRequestSender LD_LIBRARY_PATH export for SDP nodes */
const LD_EXPORT = 'LD_LIBRARY_PATH=/opt/EABpython/lib:/opt/EABfds/lib:/opt/EABfdslic/lib; export LD_LIBRARY_PATH';

/** Routes to trace in the AddTarget/RemoveTarget XML request */
const SDP_TRACE_ROUTES = [
  'FSC-Cai',
  'FSC-UssdHD',
  'PSC-BlockHandler',
  'PSC-CDRProcessor',
  'PSC-CIPDiameter',
  'PSC-ConfigHandler',
  'PSC-DCIPDiameter',
  'PSC-DdsXmlRpcIf',
  'PSC-ExternalNotification',
  'PSC-PPASInterface',
  'PSC-SDPInapHD',
  'PSC-SogInterface',
  'PSC-SubscriberHandler',
  'PSC-TrafficHandler',
  'PSC-UssdCallback',
];

/**
 * Service for SDP trace management: set/unset/fetch/export traces via SSH/SFTP.
 * Mirrors v3 customerCare.service.ts lines 1396-1932.
 */
@Injectable()
export class CustomerCareSdpTraceService {
  private readonly logger = new Logger(CustomerCareSdpTraceService.name);

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
   * Set an SDP trace for a given MSISDN on the specified SDP VIP.
   * Mirrors v3 lines 1396-1543: SFTP request XML, execute FDSRequestSender, track in DB.
   */
  async setTrace(sdpVIP: string, msisdn: string, currentUserId: string): Promise<void> {
    const configs = await this.getSdpSshConfig(sdpVIP, true);
    if (!configs.length || !configs[0].ip_address || !configs[0].ssh_user || !configs[0].ssh_pass) {
      throw new BadRequestException(ErrorMessages.CC_MISSING_SDP_VIP_CONFIG);
    }

    const config = configs[0];
    const requestFileName = `imon_trace_${generateGuid()}.xml`;
    const remoteRequestPath = `${SDP_REMOTE_PATH}${requestFileName}`;

    // Build AddTarget XML request
    const requestXml = this.buildTraceRequestXml('AddTarget', msisdn);

    try {
      // Verify remote path exists
      await this.sftpStat(config.ip_address, config.ssh_user, config.ssh_pass, SDP_REMOTE_PATH);
    } catch {
      throw new BadRequestException(ErrorMessages.CC_SDP_PATH_NOT_FOUND + config.ip_address);
    }

    // Upload the request XML to the SDP node
    await this.sftpPutContent(config.ip_address, config.ssh_user, config.ssh_pass, remoteRequestPath, requestXml);

    // Execute FDSRequestSender via interactive shell
    const success = await this.executeFdsRequestSender(
      config.ip_address,
      config.ssh_user,
      config.ssh_pass,
      config.gui_user,
      config.gui_pass,
      remoteRequestPath,
    );

    // Clean up remote request file (fire-and-forget)
    this.sftpRemove(config.ip_address, config.ssh_user, config.ssh_pass, remoteRequestPath).catch((err) =>
      this.logger.warn(`Failed to remove remote file ${remoteRequestPath}: ${(err as Error).message}`),
    );

    if (!success) {
      throw new BadRequestException(ErrorMessages.CC_ERROR_SETTING_TRACE);
    }

    await this.trackTrace('set', 'SDP', msisdn, currentUserId);
  }

  /**
   * Unset an SDP trace for a given MSISDN on the specified SDP VIP.
   * Same as setTrace but with RemoveTarget operation.
   */
  async unsetTrace(sdpVIP: string, msisdn: string, currentUserId: string): Promise<void> {
    const configs = await this.getSdpSshConfig(sdpVIP, true);
    if (!configs.length || !configs[0].ip_address || !configs[0].ssh_user || !configs[0].ssh_pass) {
      throw new BadRequestException(ErrorMessages.CC_MISSING_SDP_VIP_CONFIG);
    }

    const config = configs[0];
    const requestFileName = `imon_trace_${generateGuid()}.xml`;
    const remoteRequestPath = `${SDP_REMOTE_PATH}${requestFileName}`;

    // Build RemoveTarget XML request
    const requestXml = this.buildTraceRequestXml('RemoveTarget', msisdn);

    try {
      await this.sftpStat(config.ip_address, config.ssh_user, config.ssh_pass, SDP_REMOTE_PATH);
    } catch {
      throw new BadRequestException(ErrorMessages.CC_SDP_PATH_NOT_FOUND + config.ip_address);
    }

    await this.sftpPutContent(config.ip_address, config.ssh_user, config.ssh_pass, remoteRequestPath, requestXml);

    const success = await this.executeFdsRequestSender(
      config.ip_address,
      config.ssh_user,
      config.ssh_pass,
      config.gui_user,
      config.gui_pass,
      remoteRequestPath,
    );

    this.sftpRemove(config.ip_address, config.ssh_user, config.ssh_pass, remoteRequestPath).catch((err) =>
      this.logger.warn(`Failed to remove remote file ${remoteRequestPath}: ${(err as Error).message}`),
    );

    if (!success) {
      throw new BadRequestException(ErrorMessages.CC_ERROR_UNSETTING_TRACE);
    }

    await this.trackTrace('unset', 'SDP', msisdn, currentUserId);
  }

  /**
   * Fetch SDP trace data between two time points for a given MSISDN.
   * Mirrors v3 lines 1702-1769. Queries both SDP nodes for the VIP.
   *
   * @param fromTime Start time in yyyy-MM-dd HH:mm:ss format
   * @param toTime End time in yyyy-MM-dd HH:mm:ss format
   * @param sdpVIP SDP VIP address
   * @param msisdn Phone number to filter
   * @param raw If true, use processRawTrace; otherwise also use processRawTrace (complex ProcessTrace deferred)
   * @returns HTML-formatted trace string
   */
  async fetchTrace(fromTime: string, toTime: string, sdpVIP: string, msisdn: string, raw = false): Promise<string> {
    this.validateTraceTimeRange(fromTime, toTime);

    // Get ALL nodes for this VIP (not just live ones)
    const configs = await this.getSdpSshConfig(sdpVIP, false);
    if (!configs.length) {
      throw new BadRequestException(ErrorMessages.CC_MISSING_SDP_VIP_CONFIG);
    }

    // Format times for grep comparison: strip last 2 chars (seconds) after adjustment
    const adjFrom = this.dateTimeAdjuster(fromTime).slice(0, -2);
    const adjTo = this.dateTimeAdjuster(toTime).slice(0, -2);

    // Build the grep command for SDP trace logs
    const grepCommand = this.buildTraceGrepCommand(msisdn, adjFrom, adjTo);

    let combinedOutput = '';
    let errorCount = 0;

    // Execute on up to 2 nodes
    const nodesToQuery = configs.slice(0, 2);
    for (const config of nodesToQuery) {
      if (!config.ip_address || !config.ssh_user || !config.ssh_pass) {
        errorCount++;
        continue;
      }
      try {
        const result = await this.executeSshCommand(config.ip_address, config.ssh_user, config.ssh_pass, grepCommand);
        if (result) {
          combinedOutput += result;
        }
      } catch {
        errorCount++;
      }
    }

    if (errorCount === nodesToQuery.length) {
      throw new BadRequestException(ErrorMessages.CC_TRACE_DATA_FAILURE);
    }

    if (!combinedOutput || !combinedOutput.trim()) {
      return '<span>No trace was found!</span>';
    }

    // Both raw and non-raw use processRawTrace for now.
    // Complex ProcessTrace (provider-aware formatting) deferred to later enhancement.
    return this.processRawTrace(combinedOutput, msisdn);
  }

  /**
   * Export SDP trace as an HTML file (provider-mapped).
   * Mirrors v3 lines 1829-1841.
   */
  async exportSdpTraceHtml(fromTime: string, toTime: string, sdpVIP: string, msisdn: string): Promise<string> {
    const traceContent = await this.fetchTrace(fromTime, toTime, sdpVIP, msisdn, false);
    const htmlDocument = this.wrapInHtmlDocument(traceContent);
    return this.exportHelperService.exportHtml(htmlDocument);
  }

  /**
   * Export SDP trace as an HTML file (raw mapping).
   * Mirrors v3 lines 1843-1855.
   */
  async exportSdpTraceRawMappingHtml(
    fromTime: string,
    toTime: string,
    sdpVIP: string,
    msisdn: string,
  ): Promise<string> {
    const traceContent = await this.fetchTrace(fromTime, toTime, sdpVIP, msisdn, true);
    const htmlDocument = this.wrapInHtmlDocument(traceContent);
    return this.exportHelperService.exportHtml(htmlDocument);
  }

  /**
   * Export SDP trace as a raw text file.
   * Mirrors v3 lines 1857-1932.
   */
  async exportSdpTraceRawText(fromTime: string, toTime: string, sdpVIP: string, msisdn: string): Promise<string> {
    this.validateTraceTimeRange(fromTime, toTime);

    const configs = await this.getSdpSshConfig(sdpVIP, false);
    if (!configs.length) {
      throw new BadRequestException(ErrorMessages.CC_MISSING_SDP_VIP_CONFIG);
    }

    const adjFrom = this.dateTimeAdjuster(fromTime).slice(0, -2);
    const adjTo = this.dateTimeAdjuster(toTime).slice(0, -2);
    const grepCommand = this.buildTraceGrepCommand(msisdn, adjFrom, adjTo);

    let combinedOutput = '';
    let errorCount = 0;

    const nodesToQuery = configs.slice(0, 2);
    for (const config of nodesToQuery) {
      if (!config.ip_address || !config.ssh_user || !config.ssh_pass) {
        errorCount++;
        continue;
      }
      try {
        const result = await this.executeSshCommand(config.ip_address, config.ssh_user, config.ssh_pass, grepCommand);
        if (result) {
          combinedOutput += result;
        }
      } catch {
        errorCount++;
      }
    }

    if (errorCount === nodesToQuery.length) {
      throw new BadRequestException(ErrorMessages.CC_TRACE_DATA_FAILURE);
    }

    if (!combinedOutput || !combinedOutput.trim()) {
      throw new BadRequestException(ErrorMessages.CC_NO_TRACE_FOUND);
    }

    // Write raw text to file
    const exportDir = join(process.cwd(), 'assets', 'exports', 'text');
    await ensureDirCreation(exportDir);
    const filePath = join(exportDir, `${generateGuid()}.txt`);
    await writeFile(filePath, combinedOutput, 'utf-8');

    this.logger.log(`Text exported: ${filePath}`);
    return filePath;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Get SDP SSH configuration from the legacy data database.
   * Queries V3_sdp_nodes with AES_DECRYPT for passwords.
   */
  private async getSdpSshConfig(sdpVIP: string, isLiveOnly = true): Promise<TraceSystemConfigDTO[]> {
    const coreDb = this.configService.get<string>('DB_CORE_NAME', 'iMonitorV3_1');
    const dataDb = this.configService.get<string>('DB_DATA_NAME', 'iMonitorData');

    const encKeySubQuery = `SELECT confVal FROM \`${coreDb}\`.core_sys_config WHERE confKey = ?`;

    let query = `SELECT ip_address, ssh_user,
      AES_DECRYPT(ssh_pass, (${encKeySubQuery})) AS ssh_pass,
      gui_user,
      AES_DECRYPT(gui_pass, (${encKeySubQuery})) AS gui_pass
      FROM \`${dataDb}\`.V3_sdp_nodes WHERE vip = ?`;

    const params: (string | number)[] = [SystemKeys.aesEncryptionKey, SystemKeys.aesEncryptionKey, sdpVIP];

    if (isLiveOnly) {
      query += ' AND is_live = 1';
    }

    return this.legacyDataDbService.query<TraceSystemConfigDTO>(query, params);
  }

  /**
   * Record a trace set/unset operation in core_trace_tracker.
   */
  private async trackTrace(status: 'set' | 'unset', node: string, phoneNumber: string, userId: string): Promise<void> {
    const tracker = this.traceTrackerRepo.create({
      status: status === 'set' ? TraceTrackerStatus.SET : TraceTrackerStatus.UNSET,
      node,
      phoneNumber,
      createdAt: new Date(),
      createdby: userId,
    });
    await this.traceTrackerRepo.save(tracker);
  }

  /**
   * Process raw trace output into HTML with MSISDN highlighting.
   * Mirrors v3 ProcessRawTrace (lines 1772-1808).
   *
   * - Splits by `|`
   * - Escapes HTML entities
   * - Wraps lines in `<br>`
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
   * Wrap trace HTML content in a full HTML document for export.
   */
  private wrapInHtmlDocument(content: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'proxima-nova', Arial, sans-serif;
      padding: 20px;
      line-height: 1.4;
      font-size: 13px;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
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
   * Build the grep command for extracting trace logs from SDP nodes.
   * Mirrors v3's shell command for trace log extraction.
   */
  private buildTraceGrepCommand(msisdn: string, adjFrom: string, adjTo: string): string {
    return (
      `cat ${SDP_LOG_PATH}/TraceEventLogFile.* | grep ${msisdn} | ` +
      `awk -F"[" '{print substr($2,1,8)substr($2,10,2)substr($2,13,2),";:;"$0}' | sort | ` +
      `awk -v T1=${adjFrom} -v T2=${adjTo} -F";:;" '($1>=T1 && $1<=T2){print $2}'`
    );
  }

  /**
   * Build the AddTarget or RemoveTarget XML request for FDSRequestSender.
   */
  private buildTraceRequestXml(operation: 'AddTarget' | 'RemoveTarget', msisdn: string): string {
    const routes = SDP_TRACE_ROUTES.map((r) => `  <Route>${r}</Route>`).join('\n');
    return `<Request Operation="${operation}" SessionId="4ea74pdv" Origin="GUI" MO="TraceEventLog">
  <Target>${msisdn}</Target>
${routes}
</Request>`;
  }

  /**
   * Execute FDSRequestSender on a remote SDP node via interactive SSH shell.
   * Handles the password prompt interaction required by FDSRequestSender.
   *
   * Returns true if the command succeeds (output contains `<Response></Response>`).
   * Timeout: 60 seconds.
   */
  private async executeFdsRequestSender(
    host: string,
    sshUser: string,
    sshPass: string,
    guiUser: string,
    guiPass: string,
    remoteRequestPath: string,
  ): Promise<boolean> {
    try {
      const SSH2Promise = (await import('ssh2-promise')).default;
      const ssh = new SSH2Promise({
        host,
        username: sshUser,
        password: sshPass,
        tryKeyboard: true,
        reconnect: false,
        readyTimeout: 30000,
      });

      const fdsCommand = `${PATH_EXPORT}; ${LD_EXPORT}; FDSRequestSender -u ${guiUser} ${remoteRequestPath}`;

      return await new Promise<boolean>((resolve) => {
        let output = '';
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ssh.close().catch(() => {});
            this.logger.warn(`FDSRequestSender timed out on ${host}`);
            resolve(false);
          }
        }, 60000);

        ssh
          .shell()
          .then((stream: NodeJS.ReadWriteStream & { close: () => void }) => {
            stream.on('data', (data: Buffer) => {
              const chunk = data.toString();
              output += chunk;

              // Check for password prompt and send GUI password
              if (/password/i.test(chunk) && guiPass) {
                stream.write(guiPass + '\n');
              }

              // Check for success response
              if (output.includes('<Response></Response>') || output.includes('<Response/>')) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  stream.close();
                  ssh.close().catch(() => {});
                  resolve(true);
                }
              }
            });

            stream.on('close', () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ssh.close().catch(() => {});
                // Check final output for success
                resolve(output.includes('<Response></Response>') || output.includes('<Response/>'));
              }
            });

            stream.on('error', (err: Error) => {
              this.logger.error(`Shell error on ${host}: ${err.message}`);
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ssh.close().catch(() => {});
                resolve(false);
              }
            });

            // Send the command
            stream.write(fdsCommand + '\n');
          })
          .catch((err: Error) => {
            this.logger.error(`Failed to open shell on ${host}: ${err.message}`);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              ssh.close().catch(() => {});
              resolve(false);
            }
          });
      });
    } catch (error) {
      this.logger.error(`FDSRequestSender failed on ${host}`, (error as Error).stack);
      return false;
    }
  }

  /**
   * Execute SSH command on a remote host.
   * Uses ssh2-promise for remote command execution.
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
   * Upload file content to a remote host via SFTP.
   */
  private async sftpPutContent(
    host: string,
    username: string,
    password: string,
    remotePath: string,
    content: string,
  ): Promise<void> {
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
      const sftp = ssh.sftp();
      await sftp.writeFile(remotePath, content, 'utf-8');
      await ssh.close();
    } catch (error) {
      this.logger.error(`SFTP put failed on ${host}:${remotePath}`, (error as Error).stack);
      throw new BadRequestException(ErrorMessages.CC_SFTP_UPLOAD_FAILED);
    }
  }

  /**
   * Remove a file from a remote host via SFTP.
   */
  private async sftpRemove(host: string, username: string, password: string, remotePath: string): Promise<void> {
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
      const sftp = ssh.sftp();
      await sftp.unlink(remotePath);
      await ssh.close();
    } catch (error) {
      this.logger.warn(`SFTP remove failed on ${host}:${remotePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a remote path exists via SFTP stat.
   * Throws if the path does not exist.
   */
  private async sftpStat(host: string, username: string, password: string, remotePath: string): Promise<void> {
    const SSH2Promise = (await import('ssh2-promise')).default;
    const ssh = new SSH2Promise({
      host,
      username,
      password,
      tryKeyboard: true,
      reconnect: false,
      readyTimeout: 30000,
    });
    const sftp = ssh.sftp();
    await sftp.stat(remotePath);
    await ssh.close();
  }
}

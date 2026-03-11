import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { DateHelperService, DATE_FULL_TIME } from '../../shared/services/date-helper.service';
import { ExportHelperService, ExcelSheet } from '../../shared/services/export-helper.service';
import { ConnectivityFilter } from '../../shared/enums';
import { ErrorMessages } from '../../shared/constants/error-messages';

interface ConnectivityTable {
  id: string;
  tableName: string;
  nodeNameColumn: string;
  statDateNameColumn: string;
}

export interface TabularHeader {
  text: string;
  datafield: string;
  width?: number;
  cellsalign?: string;
  align?: string;
}

const headerDefault = { width: 150, cellsalign: 'center', align: 'center' };

@Injectable()
export class ConnectivityService {
  private readonly logger = new Logger(ConnectivityService.name);

  constructor(
    @InjectRepository(CoreModulesTables)
    private readonly modulesTablesRepo: Repository<CoreModulesTables>,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly systemConfigService: SystemConfigService,
    private readonly dateHelper: DateHelperService,
    private readonly exportHelper: ExportHelperService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================================
  // GET ALL CONNECTIVITIES (current status)
  // =========================================================================

  async getAllConnectivities(userId: string): Promise<{ header: TabularHeader[]; body: Record<string, unknown>[] }> {
    const connectivityTables = await this.getConnectivityTables();
    if (connectivityTables.length === 0) {
      return { header: this.buildCurrentHeaders(), body: [] };
    }

    const backPeriod = (await this.systemConfigService.getConfigValue('connectivityBackPeriod')) || '3';
    const dbData = this.configService.get<string>('DB_DATA_NAME');
    const dbCore = this.configService.get<string>('DB_CORE_NAME');

    const unions = connectivityTables.map((t) => {
      const statCol = this.sanitizeColumn(t.statDateNameColumn);
      const nodeCol = this.sanitizeColumn(t.nodeNameColumn);
      return `SELECT ${statCol} AS stat_date, ${nodeCol} AS node_name, ip, ssh_user, is_reporting, status, mId AS moduleId FROM ${dbData}.\`${t.tableName}\` WHERE ${statCol} >= @target_date`;
    });

    const sql = `
      SET @target_date = NOW() - INTERVAL ${parseInt(backPeriod, 10)} MINUTE;
      SELECT
        t.stat_date,
        m.name AS module,
        t.node_name,
        t.ip,
        t.ssh_user,
        CASE WHEN t.is_reporting = 1 THEN 'Reporting' ELSE 'HM' END AS state,
        t.status
      FROM (${unions.join(' UNION ALL ')}) t
      JOIN ${dbCore}.core_modules m ON t.moduleId = m.id
      JOIN ${dbCore}.core_privileges p ON t.moduleId = p.ModuleId
      JOIN ${dbCore}.core_application_roles r ON p.RoleId = r.id
      WHERE r.name = 'admin' AND p.UserId = ?
      GROUP BY t.stat_date, t.node_name, t.ip, t.ssh_user
      ORDER BY t.status, module
    `;

    try {
      const results = await this.legacyDataDb.multiQuery<Record<string, unknown>>(sql, [userId]);
      // multiQuery: index [0] = SET result, index [1] = actual data
      const body = Array.isArray(results[1]) ? results[1] : [];
      return { header: this.buildCurrentHeaders(), body };
    } catch (error) {
      this.logger.error(ErrorMessages.CONNECTIVITY_ERROR, error);
      return { header: this.buildCurrentHeaders(), body: [] };
    }
  }

  // =========================================================================
  // GET CONNECTIVITY HISTORY (date-range filtered)
  // =========================================================================

  async getUserConnectivityHistory(
    userId: string,
    fromDate: string,
    toDate: string,
    filter: ConnectivityFilter,
  ): Promise<{ header: TabularHeader[]; body: Record<string, unknown>[] }> {
    const connectivityTables = await this.getConnectivityTables();
    if (connectivityTables.length === 0) {
      return { header: this.buildHistoryHeaders(), body: [] };
    }

    const config = await this.systemConfigService.getConfigValues(['dateFormat1']);
    const rawDateFormat = config['dateFormat1'] || '%Y-%m-%d %H:%i:%s';
    // [S-04] Validate dateFormat against allowed MySQL DATE_FORMAT specifiers only.
    const DATE_FORMAT_PATTERN = /^[%YymdHhisapAMTWDSU\-:/ .]+$/;
    const dateFormat = DATE_FORMAT_PATTERN.test(rawDateFormat) ? rawDateFormat : '%Y-%m-%d %H:%i:%s';
    const filterClause = this.getConnectivityFilter(filter);

    const formattedFromDate = this.dateHelper.formatDate(DATE_FULL_TIME, new Date(fromDate));
    const formattedToDate = this.dateHelper.formatDate(DATE_FULL_TIME, new Date(toDate));

    const dbData = this.configService.get<string>('DB_DATA_NAME');
    const dbCore = this.configService.get<string>('DB_CORE_NAME');

    // [S-03] Parameterize date bounds. Each UNION arm needs both date params,
    // so push two params per table then append userId at the end.
    const queryParams: string[] = [];
    const unions = connectivityTables.map((t) => {
      const statCol = this.sanitizeColumn(t.statDateNameColumn);
      const nodeCol = this.sanitizeColumn(t.nodeNameColumn);
      queryParams.push(formattedFromDate, formattedToDate);
      return `SELECT ${statCol} AS stat_date, ${nodeCol} AS node_name, ip, ssh_user, is_reporting, status, mId AS moduleId FROM ${dbData}.\`${t.tableName}\` WHERE ${statCol} >= ? AND ${statCol} <= ? ${filterClause}`;
    });
    queryParams.push(userId);

    const sql = `
      SELECT
        DATE_FORMAT(t.stat_date, '${dateFormat}') AS stat_date,
        m.name AS module,
        t.node_name,
        t.ip,
        t.ssh_user,
        t.status
      FROM (${unions.join(' UNION ALL ')}) t
      JOIN ${dbCore}.core_modules m ON t.moduleId = m.id
      JOIN ${dbCore}.core_privileges p ON t.moduleId = p.ModuleId
      JOIN ${dbCore}.core_application_roles r ON p.RoleId = r.id
      WHERE r.name = 'admin' AND p.UserId = ?
      GROUP BY t.stat_date, t.node_name, t.ip
      ORDER BY t.stat_date, t.status
    `;

    try {
      const body = await this.legacyDataDb.query<Record<string, unknown>>(sql, queryParams);
      return { header: this.buildHistoryHeaders(), body };
    } catch (error) {
      this.logger.error(ErrorMessages.CONNECTIVITY_ERROR, error);
      return { header: this.buildHistoryHeaders(), body: [] };
    }
  }

  // =========================================================================
  // EXPORT EXCEL
  // =========================================================================

  async exportExcel(userId: string, fromDate: string, toDate: string, filter: ConnectivityFilter): Promise<string> {
    const table = await this.getUserConnectivityHistory(userId, fromDate, toDate, filter);

    const sheet: ExcelSheet = {
      name: 'connectivities_history',
      header: table.header.map((h) => ({ text: h.text, datafield: h.datafield })),
      body: table.body,
    };

    return this.exportHelper.exportTabularToExcel([sheet]);
  }

  // =========================================================================
  // GET FAILED NODES (for Socket.IO alerts — Phase 4)
  // =========================================================================

  async getFailedNodes(userId: string): Promise<string> {
    const connectivityTables = await this.getConnectivityTables();
    if (connectivityTables.length === 0) return '';

    const backPeriod = (await this.systemConfigService.getConfigValue('connectivityBackPeriod')) || '3';
    const dbData = this.configService.get<string>('DB_DATA_NAME');
    const dbCore = this.configService.get<string>('DB_CORE_NAME');

    const unions = connectivityTables.map((t) => {
      const statCol = this.sanitizeColumn(t.statDateNameColumn);
      const nodeCol = this.sanitizeColumn(t.nodeNameColumn);
      return `SELECT ${statCol} AS stat_date, ${nodeCol} AS node_name, ip, ssh_user, is_reporting, status, mId AS moduleId FROM ${dbData}.\`${t.tableName}\` WHERE ${statCol} >= @target_date AND status <> 'OK'`;
    });

    const sql = `
      SET @target_date = NOW() - INTERVAL ${parseInt(backPeriod, 10)} MINUTE;
      SELECT GROUP_CONCAT(CONCAT('"', t.node_name, '"')) AS node_name
      FROM (${unions.join(' UNION ALL ')}) t
      JOIN ${dbCore}.core_privileges p ON t.moduleId = p.ModuleId
      JOIN ${dbCore}.core_application_roles r ON p.RoleId = r.id
      WHERE r.name = 'admin' AND p.UserId = ?
      GROUP BY t.node_name
    `;

    try {
      const results = await this.legacyDataDb.multiQuery<{ node_name: string }>(sql, [userId]);
      const rows = Array.isArray(results[1]) ? results[1] : [];
      if (rows.length === 0) return '';
      const nodeNames = rows.map((r) => r.node_name).join(', ');
      return `Connectivity error on ${rows.length} node(s): ${nodeNames}`;
    } catch (error) {
      this.logger.error(ErrorMessages.CONNECTIVITY_ERROR, error);
      return '';
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * [S-01] Defense-in-depth: column names sourced from the DB are trusted, but
   * we still reject anything outside the safe identifier character set to prevent
   * accidental injection if a record is ever tampered with.
   */
  private sanitizeColumn(name: string): string {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid column identifier: "${name}"`);
    }
    return name;
  }

  private async getConnectivityTables(): Promise<ConnectivityTable[]> {
    const tables = await this.modulesTablesRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.tableName', 't.nodeNameColumn', 't.statDateNameColumn'])
      .where('t.tableName LIKE :pattern', { pattern: '%connectivity_test' })
      .getMany();

    return tables.map((t) => ({
      id: t.id,
      tableName: t.tableName,
      nodeNameColumn: t.nodeNameColumn || 'node_name',
      statDateNameColumn: t.statDateNameColumn || 'stat_date',
    }));
  }

  private getConnectivityFilter(filter: ConnectivityFilter): string {
    switch (filter) {
      case ConnectivityFilter.ACTIVE:
        return "AND status = 'OK'";
      case ConnectivityFilter.INACTIVE:
        return "AND status <> 'OK'";
      case ConnectivityFilter.ALL:
      default:
        return '';
    }
  }

  private buildCurrentHeaders(): TabularHeader[] {
    return [
      { text: 'Date', datafield: 'stat_date', ...headerDefault },
      { text: 'Module', datafield: 'module', ...headerDefault },
      { text: 'Name', datafield: 'node_name', ...headerDefault },
      { text: 'IP', datafield: 'ip', ...headerDefault },
      { text: 'User', datafield: 'ssh_user', ...headerDefault },
      { text: 'State', datafield: 'state', ...headerDefault },
      { text: 'Status', datafield: 'status', ...headerDefault },
    ];
  }

  private buildHistoryHeaders(): TabularHeader[] {
    return [
      { text: 'Date', datafield: 'stat_date', ...headerDefault },
      { text: 'Module', datafield: 'module', ...headerDefault },
      { text: 'Name', datafield: 'node_name', ...headerDefault },
      { text: 'IP', datafield: 'ip', ...headerDefault },
      { text: 'User', datafield: 'ssh_user', ...headerDefault },
      { text: 'Status', datafield: 'status', ...headerDefault },
    ];
  }
}

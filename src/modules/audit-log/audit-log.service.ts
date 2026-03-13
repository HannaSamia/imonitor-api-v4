import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AuditLogsTableResponseDto, TabularHeaderDto } from './dto/audit-log.dto';

/** Columns to skip when building the header */
const SKIP_COLUMNS = new Set(['id1', 'id2']);

/** Extra hidden column appended to every header (v3 exact) */
const EXTRA_HIDDEN_COLUMN: TabularHeaderDto = {
  text: 'r_id',
  datafield: 'r_id',
  columnName: 'r_id',
  aggregates: ['count'],
  pinned: false,
  hidden: true,
  editable: true,
  columntype: 'alpha',
};

interface CoreFieldRow {
  columnName: string;
  columnDisplayName: string;
  type: string;
}

interface AuditLogBodyRow {
  stat_date: string | null;
  sdp_name: string | null;
  user: string | null;
  origin: string | null;
  operation: string | null;
  r_id: string | null;
}

interface AuditOperationRow {
  operation: string;
}

interface AuditDetailRow {
  auditValue: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(CoreModulesTables)
    private readonly coreModulesTablesRepo: Repository<CoreModulesTables>,
    @InjectRepository(CoreTablesField)
    private readonly coreTablesFieldRepo: Repository<CoreTablesField>,
    private readonly legacyDataDb: LegacyDataDbService,
  ) {}

  /**
   * GetAuditLogsTable — builds header from iMonitorV3_1 TypeORM repos
   * and body from iMonitorData raw SQL.
   */
  async getAuditLogsTable(fromDate: string, toDate: string, operation: string[]): Promise<AuditLogsTableResponseDto> {
    // 1. Build header via TypeORM repos (iMonitorV3_1)
    const tableRecord = await this.coreModulesTablesRepo.findOne({
      where: { tableName: 'V3_audit_logs_stats' },
    });

    const header: TabularHeaderDto[] = [];

    if (tableRecord) {
      const fields = await this.coreTablesFieldRepo.find({
        where: { tId: tableRecord.id },
      });

      for (const field of fields) {
        if (SKIP_COLUMNS.has(field.columnName)) {
          continue;
        }
        header.push({
          text: field.columnDisplayName,
          datafield: field.columnName,
          columnName: field.columnName,
          aggregates: [],
          pinned: false,
          hidden: false,
          editable: true,
          columntype: field.type,
        });
      }
    }

    // Append extra hidden r_id column (v3 exact behaviour)
    header.push(EXTRA_HIDDEN_COLUMN);

    // 2. Body query from iMonitorData
    const placeholders = operation.map(() => '?').join(', ');
    const sql = `
      SELECT
        date_format(stat_date,"%Y-%m-%d %H:%m:%s") as stat_date,
        sdp_name,
        user,
        origin,
        operation,
        concat(id1,id2) as "r_id"
      FROM V3_audit_logs_stats
      WHERE stat_date >= ? AND stat_date <= ? AND operation IN (${placeholders})
    `;

    const body = await this.legacyDataDb.query<AuditLogBodyRow>(sql, [fromDate, toDate, ...operation]);

    return { header, body: body as unknown as Record<string, unknown>[] };
  }

  /**
   * GetAuditDetails — retrieves compressed request or response blob for a given row id.
   */
  async getAuditDetails(id: string, request: boolean): Promise<string> {
    const columnToSelect = request ? 'request' : 'response';

    const sql = `
      SELECT convert(uncompress(${columnToSelect}) USING utf8) as auditValue
      FROM iMonitorData.V3_audit_logs_stats
      WHERE concat(id1,id2) = ?
    `;

    const rows = await this.legacyDataDb.query<AuditDetailRow>(sql, [id]);
    const raw = rows[0]?.auditValue ?? '';

    // Clean the result: JSON.stringify then remove all quotes
    const cleaned = JSON.stringify(raw).replace(/"/g, '');
    return cleaned;
  }

  /**
   * GetAuditOperation — returns distinct operations from iMonitorData.
   */
  async getAuditOperations(): Promise<string[]> {
    const rows = await this.legacyDataDb.query<AuditOperationRow>(
      'SELECT operation FROM iMonitorData.V3_audit_logs_operations',
    );

    if (!rows || rows.length === 0) {
      throw new BadRequestException(ErrorMessages.NOT_FOUND);
    }

    return rows.map((r) => r.operation);
  }
}

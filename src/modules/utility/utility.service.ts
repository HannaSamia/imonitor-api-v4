import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { LegacyEtlDbService } from '../../database/legacy-etl-db/legacy-etl-db.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

// ─── Constants (v3 exact) ───────────────────────────────────────────────────

const QueryDateFormats = { hour: '_hourly', day: '_daily' };
const DateFormats = {
  DbHourlyDateFormat: '%Y-%m-%d %H:00:00',
  DbDailyDateFormat: '%Y-%m-%d 00:00:00',
};

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ConsolidationTablesDto {
  nodeType: string;
  tableName: string;
  groupByDaily: number;
  groupByHourly: number;
  GroupByOperator: string;
}

interface InformationColumnDetailsDto {
  name: string;
  type: string;
  key: string;
}

interface ConssolidationQueryConstructor {
  selection: string[];
  groupBy: string[];
}

interface ConsolidationEncryptionDto {
  encryptionSet: string[];
  setColumns: string[];
}

interface ConsolidationCheckRow {
  id: string;
  [key: string]: unknown;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly legacyEtlDb: LegacyEtlDbService,
    private readonly encryptionHelper: EncryptionHelperService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  ping(): string {
    return 'pong';
  }

  async consolidate(tables: string[], date: string): Promise<void> {
    for (const table of tables) {
      try {
        // 1. Get flow config from EtlV3_2
        const flowRows = await this.legacyEtlDb.query<ConsolidationTablesDto>(
          `SELECT nodeType, table_name as tableName, groupByDaily, groupByHourly, GroupByOperator
           FROM core_etl_flows cf
           JOIN core_flows_tables_relations cftr ON cf.id = cftr.flow_id
           JOIN core_file_format cff ON cff.FormatID = cf.FileFormat
           WHERE table_name = ?`,
          [table],
        );

        if (!flowRows || flowRows.length === 0) {
          this.logger.warn(`No flow config found for table: ${table}`);
          continue;
        }

        const flowConfig = flowRows[0];

        // 2. Get encryption set (varbinary columns in iMonitorData table)
        const encryptionData = await this.getEncryptionSet(table);

        // 3. If groupByHourly: processConsolidate minutely → hourly
        if (flowConfig.groupByHourly) {
          await this.processConsolidate(
            table,
            table + QueryDateFormats.hour,
            DateFormats.DbHourlyDateFormat,
            flowConfig.GroupByOperator,
            encryptionData,
          );
        }

        // 4. If groupByDaily: processConsolidate hourly → daily
        if (flowConfig.groupByDaily) {
          await this.processConsolidate(
            table + QueryDateFormats.hour,
            table + QueryDateFormats.day,
            DateFormats.DbDailyDateFormat,
            flowConfig.GroupByOperator,
            encryptionData,
          );
        }

        // 5. checkAndUpdateResult — update V3_consolidation_check in EtlV3_2
        await this.checkAndUpdateResult(table, date);
      } catch (error: unknown) {
        this.logger.error(`consolidate error for table ${table}: ${(error as Error).message}`);
        throw new BadRequestException(ErrorMessages.CONSOLIDATION_FAILED);
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async getEncryptionSet(tableName: string): Promise<ConsolidationEncryptionDto> {
    const columns = await this.legacyDataDb.query<InformationColumnDetailsDto>(
      `SELECT column_name as name, column_type as type, column_key as \`key\`
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [tableName],
    );

    const encryptionSet: string[] = [];
    const setColumns: string[] = [];

    for (const col of columns) {
      if (col.type && col.type.toLowerCase().includes('varbinary')) {
        encryptionSet.push(col.name);
        setColumns.push(col.name);
      }
    }

    return { encryptionSet, setColumns };
  }

  private async processConsolidate(
    sourceTable: string,
    targetTable: string,
    dateFormat: string,
    groupByOperator: string,
    encryptionData: ConsolidationEncryptionDto,
  ): Promise<void> {
    // Get column details for source table from INFORMATION_SCHEMA
    const columns = await this.legacyDataDb.query<InformationColumnDetailsDto>(
      `SELECT column_name as name, column_type as type, column_key as \`key\`
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [sourceTable],
    );

    if (!columns || columns.length === 0) {
      this.logger.warn(`No columns found for source table: ${sourceTable}`);
      return;
    }

    // Get dbSecureFilePath from core_sys_config via iMonitorData
    const configRows = await this.legacyDataDb.query<{ confVal: string }>(
      'SELECT confVal FROM core_sys_config WHERE confKey = ?',
      ['secureFilePath'],
    );
    const dbSecureFilePath = configRows[0]?.confVal ?? '/tmp';

    // Get AES key
    const aesKey = await this.encryptionHelper.getEncryptionKey();

    // Build SELECT and GROUP BY parts
    const queryConstructor = this.buildConsolidationQuery(columns, dateFormat, groupByOperator, encryptionData, aesKey);

    const selectPart = queryConstructor.selection.join(', ');
    const groupByPart = queryConstructor.groupBy.join(', ');

    const outFilePath = `${dbSecureFilePath}/${sourceTable}_consolidation_tmp.csv`;

    // Build and execute SELECT INTO OUTFILE
    const selectIntoSql = `
      SELECT ${selectPart}
      FROM ${sourceTable}
      WHERE stat_date >= DATE_FORMAT(?, '${dateFormat}')
        AND stat_date < DATE_FORMAT(DATE_ADD(?, INTERVAL 1 DAY), '${dateFormat}')
      GROUP BY ${groupByPart}
      INTO OUTFILE '${outFilePath}'
      FIELDS TERMINATED BY ','
      LINES TERMINATED BY '\n'
    `;

    await this.legacyDataDb.affectedQuery(selectIntoSql, []);

    // Build and execute LOAD DATA INFILE into target
    const loadDataSql = `
      LOAD DATA INFILE '${outFilePath}'
      INTO TABLE ${targetTable}
      FIELDS TERMINATED BY ','
      LINES TERMINATED BY '\n'
    `;

    await this.legacyDataDb.affectedQuery(loadDataSql, []);
  }

  private buildConsolidationQuery(
    columns: InformationColumnDetailsDto[],
    dateFormat: string,
    groupByOperator: string,
    encryptionData: ConsolidationEncryptionDto,
    aesKey: string,
  ): ConssolidationQueryConstructor {
    const selection: string[] = [];
    const groupBy: string[] = [];

    for (const col of columns) {
      const isEncrypted = encryptionData.encryptionSet.includes(col.name);

      if (col.name === 'stat_date') {
        selection.push(`DATE_FORMAT(stat_date, '${dateFormat}') as stat_date`);
        groupBy.push(`DATE_FORMAT(stat_date, '${dateFormat}')`);
        continue;
      }

      if (col.key === 'PRI' || col.type.includes('varchar') || col.type.includes('tinyint')) {
        if (isEncrypted) {
          selection.push(
            `AES_ENCRYPT(CAST(AES_DECRYPT(${col.name}, '${aesKey}') AS CHAR), '${aesKey}') as ${col.name}`,
          );
        } else {
          selection.push(col.name);
        }
        groupBy.push(col.name);
        continue;
      }

      // Numeric columns — apply operator
      const operator = this.resolveOperator(groupByOperator, col.name);
      selection.push(`${operator}(${col.name}) as ${col.name}`);
    }

    return { selection, groupBy };
  }

  private resolveOperator(groupByOperator: string, _columnName: string): string {
    if (!groupByOperator) {
      return 'SUM';
    }
    // GroupByOperator can be 'sum', 'avg', or 'special:{colName}:operator,...'
    if (groupByOperator.startsWith('special:')) {
      return 'SUM';
    }
    return groupByOperator.toUpperCase();
  }

  private async checkAndUpdateResult(table: string, date: string): Promise<void> {
    try {
      const rows = await this.legacyEtlDb.query<ConsolidationCheckRow>(
        'SELECT * FROM V3_consolidation_check WHERE table_name = ? AND stat_date = ?',
        [table, date],
      );

      if (rows && rows.length > 0) {
        const updated = await this.legacyEtlDb.affectedQuery(
          'UPDATE V3_consolidation_check SET is_consolidated = 1, consolidated_at = NOW() WHERE table_name = ? AND stat_date = ?',
          [table, date],
        );
        if (!updated || updated.affectedRows === 0) {
          throw new BadRequestException(ErrorMessages.CONSOLIDATION_UPDATE_FAILED);
        }
      } else {
        await this.legacyEtlDb.affectedQuery(
          'INSERT INTO V3_consolidation_check (table_name, stat_date, is_consolidated, consolidated_at) VALUES (?, ?, 1, NOW())',
          [table, date],
        );
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`checkAndUpdateResult error: ${(error as Error).message}`);
      throw new BadRequestException(ErrorMessages.CONSOLIDATION_UPDATE_FAILED);
    }
  }
}

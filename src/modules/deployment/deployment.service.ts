import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { CoreModulesTables } from '../../database/entities/core-modules-tables.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreTablesField } from '../../database/entities/core-tables-field.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AppModuleDto } from './dto/deployment.dto';

interface InformationColumnDto {
  name: string;
  type: string;
}

@Injectable()
export class DeploymentService {
  private readonly logger = new Logger(DeploymentService.name);

  constructor(
    @InjectRepository(CoreModules)
    private readonly coreModulesRepo: Repository<CoreModules>,
    @InjectRepository(CoreModulesTables)
    private readonly coreModulesTablesRepo: Repository<CoreModulesTables>,
    @InjectRepository(CoreTablesField)
    private readonly coreTablesFieldRepo: Repository<CoreTablesField>,
    @InjectRepository(CorePrivileges)
    private readonly corePrivilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreApplicationUsers)
    private readonly coreUsersRepo: Repository<CoreApplicationUsers>,
    @InjectRepository(CoreApplicationRoles)
    private readonly coreRolesRepo: Repository<CoreApplicationRoles>,
    private readonly legacyDataDb: LegacyDataDbService,
  ) {}

  /**
   * tableFieldsFixer — scans INFORMATION_SCHEMA for actual columns
   * of tables matching a given tableType and inserts them into core_tables_field.
   */
  async tableFieldsFixer(tableType: string): Promise<void> {
    try {
      // 1. Get all core_modules_tables entries with matching tableType
      const tables = await this.coreModulesTablesRepo.find({
        where: { tableType },
        select: { id: true, tableName: true },
      });

      for (const table of tables) {
        // 2. Query INFORMATION_SCHEMA for column metadata (iMonitorData DB)
        const columns = await this.legacyDataDb.query<InformationColumnDto>(
          `SELECT column_name as name, column_type as type
           FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = ?`,
          [table.tableName],
        );

        // 3. Build and save CoreTablesField entries
        for (const col of columns) {
          const displayName = this.buildDisplayName(col.name);
          const fieldType = this.resolveFieldType(col.type, tableType);

          const fieldEntity = this.coreTablesFieldRepo.create({
            id: uuidv4(),
            tId: table.id,
            columnName: col.name,
            columnDisplayName: displayName,
            type: fieldType,
          });

          await this.coreTablesFieldRepo.save(fieldEntity);
        }
      }
    } catch (error: unknown) {
      this.logger.error(`tableFieldsFixer error: ${(error as Error).message}`);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_FIXING_TABLE_FIELDS);
    }
  }

  /**
   * moduleInserter — inserts a new module into core_modules and creates
   * default N/A privilege entries for all existing users.
   */
  async moduleInserter(appModule: AppModuleDto): Promise<void> {
    try {
      // 1. Insert into core_modules via TypeORM
      const moduleEntity = this.coreModulesRepo.create({
        id: appModule.id,
        pId: appModule.pId ?? null,
        isMenuItem: appModule.isMenuItem,
        priority: appModule.priority,
        name: appModule.name,
        isDefault: appModule.isDefault,
        nestedLevel: appModule.nestedLevel ?? null,
        icon: appModule.icon ?? null,
        path: appModule.path ?? null,
        lightColor: appModule.color ?? null,
        darkColor: '#1f1f1f',
        font: appModule.font ?? null,
      });

      await this.coreModulesRepo.save(moduleEntity);

      // 2. Get all users
      const users = await this.coreUsersRepo.find({
        where: { isDeleted: false },
        select: { id: true },
      });

      // 3. Find N/A role
      const naRole = await this.coreRolesRepo.findOne({
        where: { name: 'N/A' },
        select: { id: true },
      });

      if (!naRole) {
        this.logger.warn('N/A role not found — skipping privilege creation');
        return;
      }

      // 4. Insert a privilege entry for each user
      for (const user of users) {
        const privilege = this.corePrivilegesRepo.create({
          id: uuidv4(),
          userId: user.id,
          roleId: naRole.id,
          moduleId: appModule.id as unknown as number,
        });

        await this.corePrivilegesRepo.save(privilege);
      }
    } catch (error: unknown) {
      this.logger.error(`moduleInserter error: ${(error as Error).message}`);
      throw new BadRequestException(ErrorMessages.ERROR_WHILE_INSERTING_MODULE);
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build a human-readable display name from a column name.
   * - name.length <= 4: use UPPERCASE
   * - else: split on camelCase/underscore, capitalize first letter of result
   * (Preserves v3 logic exactly)
   */
  private buildDisplayName(name: string): string {
    if (name.length <= 4) {
      return name.toUpperCase();
    }
    // Split on underscores or camelCase boundaries
    const words = name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * Resolve display column type from SQL type string.
   * (Preserves v3 logic exactly — including leading spaces)
   */
  private resolveFieldType(type: string, tableType: string): string {
    const lower = type.toLowerCase();
    if (lower.includes('var')) {
      return tableType === 'node' ? 'textbox' : 'alpha';
    }
    if (lower.startsWith('int')) {
      return ' number';
    }
    if (lower.includes('tinyint')) {
      return ' checkbox';
    }
    if (lower.includes('datetime')) {
      return ' datetime';
    }
    return 'alpha';
  }
}

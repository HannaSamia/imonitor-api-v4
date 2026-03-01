import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegacyEtlDbService } from './legacy-etl-db.service';

export const LEGACY_ETL_DB = 'LEGACY_ETL_DB';

@Global()
@Module({
  providers: [
    {
      provide: LEGACY_ETL_DB,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const mysql = await import('mysql2/promise');
        return mysql.createPool({
          host: configService.get<string>('DB_HOST'),
          user: configService.get<string>('DB_USER'),
          password: configService.get<string>('DB_PASSWORD'),
          port: configService.get<number>('DB_PORT'),
          database: configService.get<string>('etlDbName', 'EtlV3_2').replace(/`/g, ''),
          decimalNumbers: true,
          multipleStatements: true,
          connectionLimit: 15,
          enableKeepAlive: true,
          keepAliveInitialDelay: 1000,
          typeCast: (field: any, next: () => any) => {
            if (field.type === 'VAR_STRING') {
              return field.string();
            }
            return next();
          },
        });
      },
    },
    LegacyEtlDbService,
  ],
  exports: [LegacyEtlDbService, LEGACY_ETL_DB],
})
export class LegacyEtlDbModule {}

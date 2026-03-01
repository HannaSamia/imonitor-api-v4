import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegacyPrestoService } from './legacy-presto.service';

export const PRESTO_CLIENT = 'PRESTO_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: PRESTO_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Presto client configuration matching v3's setup
        // The presto-client package is lazy-loaded when needed
        return {
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
        };
      },
    },
    LegacyPrestoService,
  ],
  exports: [LegacyPrestoService, PRESTO_CLIENT],
})
export class LegacyPrestoModule {}

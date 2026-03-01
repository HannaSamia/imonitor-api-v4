import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mariadb',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('coreDbName', 'iMonitorV3_1').replace(/`/g, ''),
        entities: [__dirname + '/entities/**/*.entity{.ts,.js}'],
        synchronize: false,
        migrationsRun: false,
        logging: ['error', 'warn'],
        extra: {
          connectionLimit: 15,
          enableKeepAlive: true,
          keepAliveInitialDelay: 1000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}

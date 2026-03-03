import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Standalone DataSource for TypeORM CLI (migrations).
 * Usage: npm run migration:generate -- src/database/migrations/MigrationName
 *        npm run migration:run
 *        npm run migration:revert
 */
export default new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: (process.env.coreDbName ?? 'iMonitorV3_1').replace(/`/g, ''),
  entities: [__dirname + '/entities/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  logging: ['error', 'warn'],
});

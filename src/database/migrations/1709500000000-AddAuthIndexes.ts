import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthIndexes1709500000000 implements MigrationInterface {
  name = 'AddAuthIndexes1709500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── core_application_users ──────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_userName
      ON core_application_users (userName)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_email
      ON core_application_users (email)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_isDeleted
      ON core_application_users (isDeleted)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_email_isDeleted
      ON core_application_users (email, isDeleted)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_users_userName_isDeleted
      ON core_application_users (userName, isDeleted)
    `);

    // ── core_privileges ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_privileges_userId_moduleId
      ON core_privileges (UserId, ModuleId)
    `);

    // ── core_application_refresh_token ──────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_refreshToken_jwtId
      ON core_application_refresh_token (jwtId)
    `);

    // ── core_minimum_privileges ─────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_minPriv_request_method
      ON core_minimum_privileges (request, method)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_userName ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_email ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_email_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_userName_isDeleted ON core_application_users`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_privileges_userId_moduleId ON core_privileges`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_refreshToken_jwtId ON core_application_refresh_token`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_minPriv_request_method ON core_minimum_privileges`);
  }
}

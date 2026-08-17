import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogMeta1787011200000 implements MigrationInterface {
  name = 'AddLogMeta1787011200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE logs
        ADD COLUMN IF NOT EXISTS meta jsonb NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE logs
        DROP COLUMN IF EXISTS meta
    `);
  }
}

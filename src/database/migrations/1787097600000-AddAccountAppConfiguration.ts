import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountAppConfiguration1787097600000
  implements MigrationInterface
{
  name = 'AddAccountAppConfiguration1787097600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS app_configuration integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      UPDATE accounts
        SET app_configuration = 1
        WHERE app_configuration IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS app_configuration
    `);
  }
}

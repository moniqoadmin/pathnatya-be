import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountNumberOfRebootAndVideoOnly1786987200000
  implements MigrationInterface
{
  name = 'AddAccountNumberOfRebootAndVideoOnly1786987200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS number_of_reboot integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS video_only boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS video_only,
        DROP COLUMN IF EXISTS number_of_reboot
    `);
  }
}

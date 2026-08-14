import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountImportJobs1786723200000 implements MigrationInterface {
  name = 'AddAccountImportJobs1786723200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE account_import_jobs_status_enum AS ENUM
          ('queued', 'processing', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE account_import_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        status account_import_jobs_status_enum NOT NULL,
        file_name varchar(255) NOT NULL,
        file_size integer NOT NULL,
        file_data bytea NULL,
        total_rows integer NOT NULL DEFAULT 0,
        created_count integer NOT NULL DEFAULT 0,
        failed_count integer NOT NULL DEFAULT 0,
        failure_message text NULL,
        requested_by uuid NULL,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_account_import_jobs_requester
          FOREIGN KEY (requested_by) REFERENCES accounts(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE account_import_job_errors (
        id bigserial PRIMARY KEY,
        job_id uuid NOT NULL,
        row_number integer NOT NULL,
        sn varchar NULL,
        country varchar NULL,
        sanghat varchar NULL,
        jilha varchar NULL,
        taluka varchar NULL,
        "group" varchar NULL,
        kendra varchar NULL,
        sanchalak_name varchar NULL,
        phone_number varchar NULL,
        error text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_account_import_job_errors_job
          FOREIGN KEY (job_id) REFERENCES account_import_jobs(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_account_import_jobs_status_created_at ON account_import_jobs(status, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_account_import_job_errors_job_row ON account_import_job_errors(job_id, row_number)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_accounts_lower_sanghat_role_created ON accounts(LOWER(sanghat), role, created_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_accounts_role_created ON accounts(role, created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_accounts_role_created');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_accounts_lower_sanghat_role_created',
    );
    await queryRunner.query('DROP TABLE IF EXISTS account_import_job_errors');
    await queryRunner.query('DROP TABLE IF EXISTS account_import_jobs');
    await queryRunner.query(
      'DROP TYPE IF EXISTS account_import_jobs_status_enum',
    );
  }
}

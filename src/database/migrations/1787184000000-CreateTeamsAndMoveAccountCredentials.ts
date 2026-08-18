import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeamsAndMoveAccountCredentials1787184000000 implements MigrationInterface {
  name = 'CreateTeamsAndMoveAccountCredentials1787184000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL,
        team_number integer NOT NULL,
        password_hash varchar NULL,
        set_password boolean NOT NULL DEFAULT true,
        system_address varchar(64) NULL,
        metadata jsonb NULL,
        is_login_disabled boolean NOT NULL DEFAULT false,
        last_login_time timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_teams_account_team_number UNIQUE (account_id, team_number),
        CONSTRAINT fk_teams_account
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_account_id ON teams (account_id)
    `);

    // Keep a team row for every registered system address even if number_of_teams
    // was lower than the array length.
    await queryRunner.query(`
      UPDATE accounts
      SET number_of_teams = GREATEST(
        COALESCE(number_of_teams, 1),
        COALESCE(cardinality(system_address), 0)
      )
      WHERE COALESCE(cardinality(system_address), 0) > COALESCE(number_of_teams, 1)
    `);

    await queryRunner.query(`
      INSERT INTO teams (
        account_id,
        team_number,
        password_hash,
        set_password,
        system_address,
        last_login_time
      )
      SELECT
        a.id,
        gs.n,
        CASE
          WHEN gs.n = 1 THEN a.password_hash
          WHEN a.system_address IS NOT NULL
            AND gs.n <= cardinality(a.system_address)
            THEN a.password_hash
          ELSE NULL
        END,
        CASE
          WHEN gs.n = 1 THEN COALESCE(a.set_password, true)
          WHEN a.system_address IS NOT NULL
            AND gs.n <= cardinality(a.system_address)
            AND a.password_hash IS NOT NULL
            THEN COALESCE(a.set_password, false)
          ELSE true
        END,
        CASE
          WHEN a.system_address IS NOT NULL
            AND gs.n <= cardinality(a.system_address)
            THEN a.system_address[gs.n]
          ELSE NULL
        END,
        CASE WHEN gs.n = 1 THEN a.last_login_time ELSE NULL END
      FROM accounts a
      CROSS JOIN LATERAL generate_series(
        1,
        GREATEST(
          COALESCE(a.number_of_teams, 1),
          COALESCE(cardinality(a.system_address), 0),
          1
        )
      ) AS gs(n)
    `);

    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS password_hash,
        DROP COLUMN IF EXISTS set_password,
        DROP COLUMN IF EXISTS system_address,
        DROP COLUMN IF EXISTS last_login_time,
        DROP COLUMN IF EXISTS ip_address
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS password_hash varchar NULL,
        ADD COLUMN IF NOT EXISTS set_password boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS system_address text[] NULL,
        ADD COLUMN IF NOT EXISTS last_login_time timestamptz NULL,
        ADD COLUMN IF NOT EXISTS ip_address varchar(64) NULL
    `);

    await queryRunner.query(`
      UPDATE accounts a
      SET
        password_hash = t.password_hash,
        set_password = t.set_password,
        last_login_time = t.last_login_time,
        ip_address = t.system_address,
        system_address = (
          SELECT ARRAY_AGG(team.system_address ORDER BY team.team_number)
          FROM teams team
          WHERE team.account_id = a.id
            AND team.system_address IS NOT NULL
        )
      FROM teams t
      WHERE t.account_id = a.id
        AND t.team_number = 1
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS teams`);
  }
}

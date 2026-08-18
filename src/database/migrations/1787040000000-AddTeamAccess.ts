import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeamAccess1787040000000 implements MigrationInterface {
  name = 'AddTeamAccess1787040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "team_access" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "team_number" integer NOT NULL,
        "team_name" character varying(120) NOT NULL,
        "password_hash" character varying,
        "set_password" boolean NOT NULL DEFAULT true,
        "system_address" character varying(255),
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_team_access_account_team_number" UNIQUE ("account_id", "team_number"),
        CONSTRAINT "PK_team_access" PRIMARY KEY ("id"),
        CONSTRAINT "FK_team_access_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_team_access_team_number" CHECK ("team_number" BETWEEN 1 AND 20)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "team_access" (
        "account_id", "team_number", "team_name", "password_hash", "set_password", "system_address"
      )
      SELECT
        "id",
        1,
        'Krishna',
        "password_hash",
        COALESCE("set_password", true),
        CASE WHEN "system_address" IS NOT NULL AND array_length("system_address", 1) >= 1 THEN "system_address"[1] ELSE NULL END
      FROM "accounts"
    `);

    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "system_address"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "password_hash"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "set_password"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" ADD "set_password" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD "password_hash" character varying`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD "system_address" text array`);

    await queryRunner.query(`
      UPDATE "accounts" a
      SET
        "password_hash" = t."password_hash",
        "set_password" = t."set_password",
        "system_address" = CASE WHEN t."system_address" IS NULL THEN NULL ELSE ARRAY[t."system_address"] END
      FROM "team_access" t
      WHERE t."account_id" = a."id" AND t."team_number" = 1
    `);

    await queryRunner.query(`DROP TABLE "team_access"`);
  }
}

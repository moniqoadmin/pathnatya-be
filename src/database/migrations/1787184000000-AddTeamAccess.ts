import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeamAccess1787184000000 implements MigrationInterface {
  name = 'AddTeamAccess1787184000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "team_access" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "phone_number" varchar(20) NOT NULL,
        "team_number" integer NOT NULL,
        "password_hash" varchar,
        "set_password" boolean NOT NULL DEFAULT true,
        "system_address" varchar(255),
        "metadata" jsonb,
        "is_login_disabled" boolean NOT NULL DEFAULT false,
        "last_login" timestamptz,
        "ip_address" varchar(64),
        "dom_security" boolean NOT NULL DEFAULT false,
        "chokidar" boolean NOT NULL DEFAULT false,
        "video_only" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_team_access_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_team_access_account_team" UNIQUE ("account_id", "team_number"),
        CONSTRAINT "FK_team_access_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_team_access_phone_system" ON "team_access" ("phone_number", "system_address")`,
    );

    await queryRunner.query(`
      INSERT INTO "team_access" (
        "account_id", "phone_number", "team_number", "password_hash", "set_password",
        "system_address", "is_login_disabled", "last_login", "ip_address",
        "dom_security", "chokidar", "video_only"
      )
      SELECT
        "id",
        "phone_number",
        1,
        "password_hash",
        COALESCE("set_password", true),
        CASE WHEN "system_address" IS NOT NULL AND array_length("system_address", 1) >= 1
          THEN "system_address"[1] ELSE NULL END,
        COALESCE("is_login_disabled", false),
        "last_login_time",
        "ip_address",
        COALESCE("dom_security", false),
        COALESCE("chokidar", false),
        COALESCE("video_only", false)
      FROM "accounts"
    `);

    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "password_hash"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "set_password"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "system_address"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "is_login_disabled"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "last_login_time"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "ip_address"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "dom_security"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "chokidar"`);
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN IF EXISTS "video_only"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "password_hash" varchar`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "set_password" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "system_address" text[]`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "is_login_disabled" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "last_login_time" timestamptz`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "ip_address" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "dom_security" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "chokidar" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "video_only" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`
      UPDATE "accounts" a
      SET
        "password_hash" = t."password_hash",
        "set_password" = t."set_password",
        "system_address" = CASE WHEN t."system_address" IS NULL THEN NULL ELSE ARRAY[t."system_address"] END,
        "is_login_disabled" = t."is_login_disabled",
        "last_login_time" = t."last_login",
        "ip_address" = t."ip_address",
        "dom_security" = t."dom_security",
        "chokidar" = t."chokidar",
        "video_only" = t."video_only"
      FROM "team_access" t
      WHERE t."account_id" = a."id" AND t."team_number" = 1
    `);

    await queryRunner.query(`DROP TABLE "team_access"`);
  }
}

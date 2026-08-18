import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfigurationTables1787057400000 implements MigrationInterface {
  name = 'AddConfigurationTables1787057400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_configurations" (
        "id" SERIAL NOT NULL,
        "video_config" jsonb NOT NULL,
        "video_files" jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT "PK_app_configurations_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "server_api_urls" (
        "id" integer NOT NULL,
        "link" character varying(2048) NOT NULL,
        CONSTRAINT "CHK_server_api_urls_id" CHECK ("id" IN (1, 2)),
        CONSTRAINT "PK_server_api_urls_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `INSERT INTO "app_configurations" ("video_config", "video_files") VALUES ($1::jsonb, '[]'::jsonb)`,
      [
        JSON.stringify({
          DEFAULT_HLS_SOURCE:
            'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
          ALLOWED_HOSTS: ['pathnatya-video-cdn.b-cdn.net'],
        }),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "server_api_urls"`);
    await queryRunner.query(`DROP TABLE "app_configurations"`);
  }
}

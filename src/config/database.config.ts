import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const buildDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  // Prefer server environment variables (process.env), fall back to ConfigService
  // so this works both with a local .env file and with variables set on the server.
  const getEnv = (key: string): string | undefined =>
    process.env[key] ?? config.get<string>(key);

  const url = getEnv('DATABASE_URL');

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Set it in your .env file or as a server environment variable.',
    );
  }

  const useSsl = getEnv('DB_SSL') === 'true';

  return {
    type: 'postgres',
    url,
    autoLoadEntities: true,
    synchronize: getEnv('DB_SYNCHRONIZE') === 'true',
    logging: getEnv('DB_LOGGING') === 'true',
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    extra: {
      max: Number(getEnv('DB_POOL_MAX') ?? 20),
      connectionTimeoutMillis: Number(
        getEnv('DB_CONNECTION_TIMEOUT_MS') ?? 5_000,
      ),
      idleTimeoutMillis: Number(getEnv('DB_IDLE_TIMEOUT_MS') ?? 30_000),
      statement_timeout: Number(getEnv('DB_STATEMENT_TIMEOUT_MS') ?? 30_000),
    },
  };
};

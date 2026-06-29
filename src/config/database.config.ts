import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const buildDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const url = config.get<string>('DATABASE_URL');

  if (!url) {
    throw new Error('DATABASE_URL is not set. Check your .env file.');
  }

  const useSsl = config.get<string>('DB_SSL') === 'true';

  return {
    type: 'postgres',
    url,
    autoLoadEntities: true,
    synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
    logging: config.get<string>('DB_LOGGING') === 'true',
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
};

import { ExecutionContext, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { buildCacheConfig } from './config/cache.config';
import { buildDatabaseConfig } from './config/database.config';
import { ConfigurationStorageModule } from './config/configuration-storage.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './accounts/accounts.module';
import { PayloadCryptoModule } from './crypto/payload-crypto.module';
import { LogsModule } from './logs/logs.module';
import { VideosModule } from './videos/videos.module';
import { IssuesModule } from './issues/issues.module';
import { ImportsModule } from './imports/imports.module';

function loadTestKeyMatches(
  provided: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PayloadCryptoModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const loadTestKey = config.get<string>('LOAD_TEST_KEY');
        return {
          skipIf: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest<{
              headers: Record<string, string | string[] | undefined>;
              method?: string;
              url?: string;
            }>();
            const headerPresent =
              typeof req.headers['x-load-test-key'] === 'string';
            if (!headerPresent) return false;
            const matched =
              !!loadTestKey &&
              loadTestKeyMatches(req.headers['x-load-test-key'], loadTestKey);
            return config.get('NODE_ENV') !== 'production' && matched;
          },
          throttlers: [
            {
              ttl: Number(config.get('THROTTLE_TTL_MS', 60_000)),
              limit: Number(config.get('THROTTLE_LIMIT', 100)),
            },
          ],
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildDatabaseConfig(config),
    }),
    ConfigurationStorageModule,
    CacheModule.register({
      isGlobal: true,
      ...buildCacheConfig(),
    }),
    HealthModule,
    AccountsModule,
    LogsModule,
    VideosModule,
    IssuesModule,
    ImportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

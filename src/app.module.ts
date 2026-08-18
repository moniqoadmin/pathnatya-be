import { ExecutionContext, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { buildCacheConfig } from './config/cache.config';
import { buildDatabaseConfig } from './config/database.config';
import { AppConfiguration } from './config/entities/app-configuration.entity';
import { ServerApiUrl } from './config/entities/server-api-url.entity';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './accounts/accounts.module';
import { PayloadCryptoModule } from './crypto/payload-crypto.module';
import { LogsModule } from './logs/logs.module';
import { VideosModule } from './videos/videos.module';
import { IssuesModule } from './issues/issues.module';
import { RedisModule } from './redis/redis.module';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';
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
    RedisModule,
    PayloadCryptoModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => {
        const loadTestKey = config.get<string>('LOAD_TEST_KEY');
        return {
          storage,
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
    TypeOrmModule.forFeature([AppConfiguration, ServerApiUrl]),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildCacheConfig(config),
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

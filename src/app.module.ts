import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { buildDatabaseConfig } from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './accounts/accounts.module';
import { PayloadCryptoModule } from './crypto/payload-crypto.module';

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
            if (!loadTestKey) return false;
            const req = context.switchToHttp().getRequest<{
              headers: Record<string, string | string[] | undefined>;
            }>();
            return loadTestKeyMatches(req.headers['x-load-test-key'], loadTestKey);
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
    HealthModule,
    AccountsModule,
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

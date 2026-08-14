import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PayloadCryptoService } from './crypto/payload-crypto.service';
import { PayloadEncryptionExceptionFilter } from './crypto/payload-encryption.exception-filter';

async function bootstrap() {
  // Disable default body parser so we can raise the limit for large segment
  // payloads (remoteData base64 can be tens of MB).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Security headers (CSP, HSTS, COEP, COOP, + helmet defaults). Apply early.
  app.use(
    helmet({
      // Tuned so /docs (Swagger UI) still loads; API JSON responses are unaffected.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: [],
        },
      },
      // Browsers only honor HSTS over HTTPS (safe locally over http).
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      crossOriginEmbedderPolicy: { policy: 'require-corp' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      // Allow CORS clients (Vite UI, etc.) to read API responses.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Permissions-Policy is not bundled in helmet 8; set explicitly.
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ].join(', '),
    );
    next();
  });

  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // So req.ip reflects the real client when behind Railway / a reverse proxy.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const payloadCrypto = app.get(PayloadCryptoService);
  app.useGlobalFilters(new PayloadEncryptionExceptionFilter(payloadCrypto));

  // Explicit origin allowlist — never use `*` (that would accept any host/port).
  // Requests with no Origin header (Electron main, curl, server-to-server) are allowed.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pathnatya Backend API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  app.enableShutdownHooks();
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Application running on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  if (swaggerEnabled) {
    console.log(`Swagger docs on http://localhost:${port}/docs`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `Payload encryption: ${payloadCrypto.isEnabled() ? 'ON' : 'OFF'}`,
  );
}
bootstrap();

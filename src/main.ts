import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { PayloadCryptoService } from './crypto/payload-crypto.service';
import { PayloadEncryptionExceptionFilter } from './crypto/payload-encryption.exception-filter';

async function bootstrap() {
  // Disable default body parser so we can raise the limit for large segment
  // payloads (remoteData base64 can be tens of MB).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(json({ limit: '70mb' }));
  app.use(urlencoded({ extended: true, limit: '70mb' }));

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pathnatya Backend API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Application running on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs on http://localhost:${port}/docs`);
  // eslint-disable-next-line no-console
  console.log(
    `Payload encryption: ${payloadCrypto.isEnabled() ? 'ON' : 'OFF'}`,
  );
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PayloadCryptoService } from './crypto/payload-crypto.service';
import { PayloadEncryptionExceptionFilter } from './crypto/payload-encryption.exception-filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  app.enableCors();


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

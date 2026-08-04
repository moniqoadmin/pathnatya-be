import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { PayloadCryptoController } from './payload-crypto.controller';
import { PayloadCryptoService } from './payload-crypto.service';
import { PayloadEncryptionInterceptor } from './payload-encryption.interceptor';

@Global()
@Module({
  controllers: [PayloadCryptoController],
  providers: [
    PayloadCryptoService,
    AppKeyGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: PayloadEncryptionInterceptor,
    },
  ],
  exports: [PayloadCryptoService],
})
export class PayloadCryptoModule {}

import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PayloadCryptoService } from './payload-crypto.service';
import { PayloadEncryptionInterceptor } from './payload-encryption.interceptor';

@Global()
@Module({
  providers: [
    PayloadCryptoService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PayloadEncryptionInterceptor,
    },
  ],
  exports: [PayloadCryptoService],
})
export class PayloadCryptoModule {}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { EncryptPayloadDto } from './dto/encrypt-payload.dto';
import { DecryptPayloadDto } from './dto/decrypt-payload.dto';
import { PayloadCryptoService } from './payload-crypto.service';
import { SkipPayloadEncryption } from './skip-payload-encryption.decorator';

@ApiTags('crypto')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@SkipPayloadEncryption()
@UseGuards(AppKeyGuard)
@Controller('crypto')
export class PayloadCryptoController {
  constructor(private readonly payloadCrypto: PayloadCryptoService) {}

  @Post('encrypt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Encrypt a JSON value as a compact JWE (dir / A256GCM). Returns { payload }. Skips transport-layer payload encryption.',
  })
  async encrypt(@Body() dto: EncryptPayloadDto) {
    const payload = await this.payloadCrypto.encryptJson(dto.data);
    return { payload };
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Decrypt a compact JWE payload. Returns { data }. Skips transport-layer payload encryption.',
  })
  async decrypt(@Body() dto: DecryptPayloadDto) {
    const data = await this.payloadCrypto.decryptJson(dto.payload);
    return { data };
  }
}

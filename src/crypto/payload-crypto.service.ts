import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CompactEncrypt, compactDecrypt } from 'jose';

@Injectable()
export class PayloadCryptoService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<string>('PAYLOAD_ENCRYPTION', 'true') !== 'false';
  }

  /**
   * Key derived from ELECTRON_APP_1 (SHA-256 → 32 bytes for A256GCM).
   * Electron must use the same derivation for payload encrypt/decrypt.
   */
  private getSecretKey(): Uint8Array {
    const secret = this.configService.getOrThrow<string>('ELECTRON_APP_1');
    return createHash('sha256').update(secret).digest();
  }

  async encryptJson(data: unknown): Promise<string> {
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    return new CompactEncrypt(plaintext)
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(this.getSecretKey());
  }

  async decryptJson(token: string): Promise<unknown> {
    try {
      const { plaintext } = await compactDecrypt(token, this.getSecretKey());
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      throw new BadRequestException('Invalid encrypted payload');
    }
  }
}

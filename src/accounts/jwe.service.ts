import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EncryptJWT, JWTPayload, jwtDecrypt } from 'jose';
export interface JweTokenPayload extends JWTPayload {
  sub: string;
}

const ACCOUNT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JweService {
  constructor(private readonly configService: ConfigService) {}

  private deriveSecretKey(envKey: string): Uint8Array {
    const secret = this.configService.getOrThrow<string>(envKey);
    return createHash('sha256').update(secret).digest();
  }

  private getSecretKey(): Uint8Array {
    return this.deriveSecretKey('JWE_SECRET');
  }

  private getLoginSecretKey(): Uint8Array {
    return this.deriveSecretKey('JWE_SECRET1');
  }

  async encryptAccountToken(accountId: string): Promise<string> {
    return new EncryptJWT({ sub: accountId })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .encrypt(this.getSecretKey());
  }

  private getLoginKeys(): string[] {
    return [
      this.configService.getOrThrow<string>('LOGIN_SUCCESS_KEY_1'),
      this.configService.getOrThrow<string>('LOGIN_SUCCESS_KEY_2'),
      this.configService.getOrThrow<string>('LOGIN_SUCCESS_KEY_3'),
      this.configService.getOrThrow<string>('LOGIN_SUCCESS_KEY_4'),
      this.configService.getOrThrow<string>('LOGIN_SUCCESS_KEY_5'),
    ];
  }

  async encryptLoginKey(key: string): Promise<string> {
    return new EncryptJWT({ key })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .encrypt(this.getLoginSecretKey());
  }

  async encryptLoginKeys(): Promise<string[]> {
    return Promise.all(this.getLoginKeys().map((key) => this.encryptLoginKey(key)));
  }

  async decrypt(token: string): Promise<JweTokenPayload> {
    const { payload } = await jwtDecrypt(token, this.getSecretKey());
    if (typeof payload.sub !== 'string' || !ACCOUNT_ID_RE.test(payload.sub)) {
      throw new Error('Invalid token payload');
    }
    return payload as JweTokenPayload;
  }
}

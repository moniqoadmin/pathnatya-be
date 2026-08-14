import { LoginProtectionService } from './login-protection.service';

describe('LoginProtectionService', () => {
  it('fails open when Redis is temporarily unavailable', async () => {
    const redis = {
      isConfigured: () => true,
      ensureConnected: () => Promise.reject(new Error('offline')),
    };
    const service = new LoginProtectionService(
      { get: (_key: string, fallback: number) => fallback } as never,
      redis as never,
    );

    await expect(
      service.assertAllowed('9876543210', '127.0.0.1'),
    ).resolves.toBeUndefined();
  });
});

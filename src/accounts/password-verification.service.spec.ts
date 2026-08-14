import { PasswordVerificationService } from './password-verification.service';

describe('PasswordVerificationService', () => {
  it('rejects new password work when the queue is full', async () => {
    const config = {
      get: (key: string, fallback: number) =>
        ({
          LOGIN_HASH_CONCURRENCY: 1,
          LOGIN_HASH_QUEUE_LIMIT: 0,
          LOGIN_RETRY_AFTER_SECONDS: 7,
        })[key] ?? fallback,
    };
    const service = new PasswordVerificationService(config as never);
    (service as unknown as { active: number }).active = 1;

    await expect(service.verify('password', 'salt.hash')).rejects.toMatchObject(
      {
        status: 503,
      },
    );
  });
});

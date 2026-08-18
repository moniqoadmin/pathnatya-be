import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginProtectionService } from './login-protection.service';

describe('LoginProtectionService', () => {
  const config = {
    get: (_key: string, fallback: number) => fallback,
  } as never;

  it('locks a phone after too many failures', async () => {
    const service = new LoginProtectionService(config);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure('9876543210', null);
    }

    await expect(service.assertAllowed('9876543210', null)).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await service.assertAllowed('9876543210', null);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('clears a phone lock', async () => {
    const service = new LoginProtectionService(config);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure('9876543210', null);
    }
    await service.clear('9876543210');

    await expect(
      service.assertAllowed('9876543210', null),
    ).resolves.toBeUndefined();
  });
});

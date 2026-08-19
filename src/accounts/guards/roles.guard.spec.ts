import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AccountRole } from '../entities/account.entity';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const accountsRepository = {
    findOne: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as never, accountsRepository as never);

  const contextFor = (user?: { sub: string }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as never;

  const writeRoles = [AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('allows requests when no roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor({ sub: 'u-1' }))).resolves.toBe(
      true,
    );
    expect(accountsRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows SuperAdmin and Developer for content writes', async () => {
    reflector.getAllAndOverride.mockReturnValue(writeRoles);
    accountsRepository.findOne.mockResolvedValue({
      role: AccountRole.SUPER_ADMIN,
    });

    await expect(guard.canActivate(contextFor({ sub: 'sa-1' }))).resolves.toBe(
      true,
    );

    accountsRepository.findOne.mockResolvedValue({
      role: AccountRole.DEVELOPER,
    });
    await expect(guard.canActivate(contextFor({ sub: 'dev-1' }))).resolves.toBe(
      true,
    );
  });

  it('rejects User and Admin for content writes', async () => {
    reflector.getAllAndOverride.mockReturnValue(writeRoles);
    accountsRepository.findOne.mockResolvedValue({ role: AccountRole.USER });

    await expect(guard.canActivate(contextFor({ sub: 'u-1' }))).rejects.toThrow(
      ForbiddenException,
    );

    accountsRepository.findOne.mockResolvedValue({ role: AccountRole.ADMIN });
    await expect(guard.canActivate(contextFor({ sub: 'a-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing authentication', async () => {
    reflector.getAllAndOverride.mockReturnValue(writeRoles);

    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(accountsRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects a token whose account no longer exists', async () => {
    reflector.getAllAndOverride.mockReturnValue(writeRoles);
    accountsRepository.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor({ sub: 'gone' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

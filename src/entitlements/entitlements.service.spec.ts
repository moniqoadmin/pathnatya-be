import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountRole } from '../accounts/entities/account.entity';
import { ADMIN_LOGIN_ELECTRON_APP } from './entitlements.constants';
import {
  ENTITLEMENT_CREATED_EVENT,
  ENTITLEMENT_UPDATED_EVENT,
  EntitlementsService,
} from './entitlements.service';

describe('EntitlementsService', () => {
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const auditTrailService = {
    create: jest.fn(),
  };
  const service = new EntitlementsService(
    repository as never,
    auditTrailService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.create.mockImplementation((value: unknown) => value);
  });

  it('seeds default entitlements that are not already in the table', async () => {
    repository.find.mockResolvedValue([]);
    repository.save.mockResolvedValue([]);

    await service.seedDefaults();

    expect(repository.save).toHaveBeenCalledTimes(1);
    const saved = repository.save.mock.calls[0][0] as Array<{
      key: string;
      enabled: boolean;
    }>;
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: ADMIN_LOGIN_ELECTRON_APP,
          enabled: true,
        }),
      ]),
    );
  });

  it('does not overwrite existing default entitlements', async () => {
    repository.find.mockResolvedValue([{ key: ADMIN_LOGIN_ELECTRON_APP }]);

    await service.seedDefaults();

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('treats a missing ADMIN_LOGIN_ELECTRON_APP row as enabled', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.isEnabled(ADMIN_LOGIN_ELECTRON_APP)).resolves.toBe(
      true,
    );
  });

  it('blocks privileged Electron login when the entitlement is off', async () => {
    repository.findOne.mockResolvedValue({
      key: ADMIN_LOGIN_ELECTRON_APP,
      enabled: false,
    });

    await expect(
      service.assertElectronLoginAllowed(AccountRole.SUPER_ADMIN, false),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertElectronLoginAllowed(AccountRole.SUPER_ADMIN, true),
    ).resolves.toBeUndefined();
  });

  it('creates an entitlement and writes an audit-trail entry', async () => {
    repository.findOne.mockResolvedValue(null);
    const created = {
      key: 'NEW_FLAG',
      enabled: true,
      description: 'A new flag',
      updatedBy: 'caller-1',
    };
    repository.save.mockResolvedValue(created);

    await expect(
      service.create('caller-1', {
        key: 'NEW_FLAG',
        enabled: true,
        description: 'A new flag',
      }),
    ).resolves.toEqual(created);

    expect(auditTrailService.create).toHaveBeenCalledWith('caller-1', {
      event: ENTITLEMENT_CREATED_EVENT,
      message: 'Created entitlement NEW_FLAG (enabled)',
      metaData: {
        key: 'NEW_FLAG',
        enabled: true,
        description: 'A new flag',
      },
    });
  });

  it('rejects creating a duplicate entitlement', async () => {
    repository.findOne.mockResolvedValue({ key: 'NEW_FLAG' });

    await expect(
      service.create('caller-1', { key: 'NEW_FLAG', enabled: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auditTrailService.create).not.toHaveBeenCalled();
  });

  it('updates an entitlement and writes an audit-trail entry', async () => {
    repository.findOne.mockResolvedValue({
      key: ADMIN_LOGIN_ELECTRON_APP,
      enabled: true,
      description: 'old',
      updatedBy: null,
    });
    repository.save.mockImplementation(async (value: unknown) => value);

    const saved = await service.update('caller-1', ADMIN_LOGIN_ELECTRON_APP, {
      enabled: false,
    });

    expect(saved.enabled).toBe(false);
    expect(saved.updatedBy).toBe('caller-1');
    expect(auditTrailService.create).toHaveBeenCalledWith('caller-1', {
      event: ENTITLEMENT_UPDATED_EVENT,
      message: `Set entitlement ${ADMIN_LOGIN_ELECTRON_APP} from true to false`,
      metaData: {
        key: ADMIN_LOGIN_ELECTRON_APP,
        previousEnabled: true,
        enabled: false,
        previousDescription: 'old',
        description: 'old',
      },
    });
  });

  it('does not write an audit-trail entry when nothing changed', async () => {
    repository.findOne.mockResolvedValue({
      key: ADMIN_LOGIN_ELECTRON_APP,
      enabled: true,
      description: 'same',
      updatedBy: 'caller-1',
    });

    await service.update('caller-1', ADMIN_LOGIN_ELECTRON_APP, {
      enabled: true,
    });

    expect(repository.save).not.toHaveBeenCalled();
    expect(auditTrailService.create).not.toHaveBeenCalled();
  });

  it('throws when updating a missing entitlement', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.update('caller-1', 'MISSING', { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

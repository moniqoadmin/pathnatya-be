import { AccountRole } from './entities/account.entity';
import { DEFAULT_SUPER_USER } from './accounts.constants';
import { AccountsSeedService } from './accounts.seed';

describe('AccountsSeedService', () => {
  const accountsRepository = {
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const service = new AccountsSeedService(accountsRepository as never);

  beforeEach(() => {
    jest.resetAllMocks();
    accountsRepository.create.mockImplementation((value: unknown) => value);
  });

  it('seeds the default SuperAdmin when the phone number is missing', async () => {
    accountsRepository.findOne.mockResolvedValue(null);
    accountsRepository.save.mockResolvedValue({});

    await service.seedDefaultSuperUser();

    expect(accountsRepository.save).toHaveBeenCalledTimes(1);
    expect(accountsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: DEFAULT_SUPER_USER.phoneNumber,
        sanchalakName: 'First User',
        role: AccountRole.SUPER_ADMIN,
        country: 'India',
        metadata: { source: 'seed' },
      }),
    );
  });

  it('does not overwrite an existing default SuperAdmin', async () => {
    accountsRepository.findOne.mockResolvedValue({ id: 'existing-id' });

    await service.seedDefaultSuperUser();

    expect(accountsRepository.save).not.toHaveBeenCalled();
  });
});

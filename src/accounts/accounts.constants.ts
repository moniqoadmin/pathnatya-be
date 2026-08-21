import { AccountRole } from './entities/account.entity';

/**
 * Seeded into `accounts` when the table is created (or when this phone is
 * missing). Existing rows are never overwritten.
 */
export const DEFAULT_SUPER_USER = {
  phoneNumber: '7083569270',
  sanchalakName: 'First User',
  role: AccountRole.SUPER_ADMIN,
  country: 'India',
  sanghat: null,
  jilha: null,
  taluka: null,
  group: null,
  kendra: null,
  isOffline: false,
  logoutButton: true,
  numberOfTeams: 1,
  numberOfReboot: 0,
  appConfiguration: 1,
  metadata: { source: 'seed' },
} as const;

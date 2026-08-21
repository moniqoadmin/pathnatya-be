import { AccountRole } from '../accounts/entities/account.entity';
import { isPrivilegedElectronLoginBlocked } from './entitlements.policy';

describe('isPrivilegedElectronLoginBlocked', () => {
  it('never blocks when admin=true', () => {
    for (const role of Object.values(AccountRole)) {
      expect(isPrivilegedElectronLoginBlocked(role, true, false)).toBe(false);
    }
  });

  it('never blocks User on the Electron path', () => {
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.USER, false, false),
    ).toBe(false);
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.USER, false, true),
    ).toBe(false);
  });

  it('allows Admin, SuperAdmin, and Developer on Electron when the entitlement is on', () => {
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.ADMIN, false, true),
    ).toBe(false);
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.SUPER_ADMIN, false, true),
    ).toBe(false);
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.DEVELOPER, false, true),
    ).toBe(false);
  });

  it('blocks Admin, SuperAdmin, and Developer on Electron when the entitlement is off', () => {
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.ADMIN, false, false),
    ).toBe(true);
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.SUPER_ADMIN, false, false),
    ).toBe(true);
    expect(
      isPrivilegedElectronLoginBlocked(AccountRole.DEVELOPER, false, false),
    ).toBe(true);
  });
});

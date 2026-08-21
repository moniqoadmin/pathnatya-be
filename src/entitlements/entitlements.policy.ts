import { AccountRole } from '../accounts/entities/account.entity';

const PRIVILEGED_LOGIN_ROLES: ReadonlySet<AccountRole> = new Set([
  AccountRole.ADMIN,
  AccountRole.SUPER_ADMIN,
  AccountRole.DEVELOPER,
]);

export function isPrivilegedLoginRole(role: AccountRole): boolean {
  return PRIVILEGED_LOGIN_ROLES.has(role);
}

/**
 * Electron login uses `admin=false` (or omitted). Privileged roles may use that
 * path only when ADMIN_LOGIN_ELECTRON_APP is enabled. `admin=true` (admin UI)
 * is always allowed for those roles.
 */
export function isPrivilegedElectronLoginBlocked(
  role: AccountRole,
  adminQuery: boolean,
  adminLoginElectronApp: boolean,
): boolean {
  if (adminQuery || !isPrivilegedLoginRole(role)) {
    return false;
  }
  return !adminLoginElectronApp;
}

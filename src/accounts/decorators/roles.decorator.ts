import { SetMetadata } from '@nestjs/common';
import { AccountRole } from '../entities/account.entity';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given account roles. Used with RolesGuard. */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);

import { ForbiddenException } from '@nestjs/common';
import { AccountRole } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

export type CreateAccountCaller = {
  role: AccountRole;
  sanghat: string | null;
};

export type AccountActor = {
  id: string;
  role: AccountRole;
  sanghat: string | null;
};

export function authorizeCreateAccount(
  caller: CreateAccountCaller,
  dto: CreateAccountDto,
): CreateAccountDto {
  const requestedRole = dto.role ?? AccountRole.USER;

  if (caller.role === AccountRole.ADMIN) {
    if (!caller.sanghat) {
      throw new ForbiddenException('Admin account has no sanghat assigned');
    }
    if (requestedRole !== AccountRole.USER) {
      throw new ForbiddenException('Admins can only create User accounts');
    }
    if (
      dto.sanghat &&
      dto.sanghat.toLowerCase() !== caller.sanghat.toLowerCase()
    ) {
      throw new ForbiddenException(
        'Admins can only create accounts in their sanghat',
      );
    }
    return { ...dto, role: AccountRole.USER, sanghat: caller.sanghat };
  }

  if (
    caller.role === AccountRole.SUPER_ADMIN ||
    caller.role === AccountRole.DEVELOPER
  ) {
    return dto;
  }

  throw new ForbiddenException(
    'Only Admin, SuperAdmin and Developer can create accounts',
  );
}

export function authorizeViewAccount(
  caller: AccountActor,
  target: AccountActor,
): void {
  if (caller.id === target.id) {
    return;
  }

  if (
    caller.role === AccountRole.SUPER_ADMIN ||
    caller.role === AccountRole.DEVELOPER
  ) {
    return;
  }

  if (caller.role === AccountRole.ADMIN) {
    assertAdminSanghatUser(caller, target, 'view');
    return;
  }

  throw new ForbiddenException('You can only view your own account');
}

export function authorizeDeleteAccount(
  caller: AccountActor,
  target: AccountActor,
): void {
  if (caller.role === AccountRole.ADMIN) {
    assertAdminSanghatUser(caller, target, 'delete');
    return;
  }

  if (
    caller.role === AccountRole.SUPER_ADMIN ||
    caller.role === AccountRole.DEVELOPER
  ) {
    return;
  }

  throw new ForbiddenException(
    'Only Admin, SuperAdmin and Developer can delete accounts',
  );
}

function assertAdminSanghatUser(
  caller: CreateAccountCaller,
  target: { role: AccountRole; sanghat: string | null },
  action: 'view' | 'delete',
): void {
  if (!caller.sanghat) {
    throw new ForbiddenException('Admin account has no sanghat assigned');
  }
  if (target.role !== AccountRole.USER) {
    throw new ForbiddenException(`Admins can only ${action} User accounts`);
  }
  if (
    !target.sanghat ||
    target.sanghat.toLowerCase() !== caller.sanghat.toLowerCase()
  ) {
    throw new ForbiddenException(
      `Admins can only ${action} accounts in their sanghat`,
    );
  }
}

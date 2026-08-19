import { ForbiddenException } from '@nestjs/common';
import { AccountRole } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

export type CreateAccountCaller = {
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

import { ForbiddenException } from '@nestjs/common';
import { authorizeCreateAccount } from './account-authorization';
import { AccountRole } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

describe('authorizeCreateAccount', () => {
  const userDto: CreateAccountDto = {
    phoneNumber: '9123456789',
    country: 'India',
    sanghat: 'Pune Sanghat',
  };

  it('rejects User callers', () => {
    expect(() =>
      authorizeCreateAccount(
        { role: AccountRole.USER, sanghat: 'Pune Sanghat' },
        userDto,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects Admin creating a Developer', () => {
    expect(() =>
      authorizeCreateAccount(
        { role: AccountRole.ADMIN, sanghat: 'Pune Sanghat' },
        { ...userDto, role: AccountRole.DEVELOPER },
      ),
    ).toThrow('Admins can only create User accounts');
  });

  it('rejects Admin creating a User in another sanghat', () => {
    expect(() =>
      authorizeCreateAccount(
        { role: AccountRole.ADMIN, sanghat: 'Pune Sanghat' },
        { ...userDto, sanghat: 'Mumbai Sanghat' },
      ),
    ).toThrow('Admins can only create accounts in their sanghat');
  });

  it('rejects Admin with no sanghat', () => {
    expect(() =>
      authorizeCreateAccount(
        { role: AccountRole.ADMIN, sanghat: null },
        userDto,
      ),
    ).toThrow('Admin account has no sanghat assigned');
  });

  it('forces Admin-created accounts to User in the caller sanghat', () => {
    const result = authorizeCreateAccount(
      { role: AccountRole.ADMIN, sanghat: 'Pune Sanghat' },
      { phoneNumber: '9123456789' },
    );

    expect(result).toEqual({
      phoneNumber: '9123456789',
      role: AccountRole.USER,
      sanghat: 'Pune Sanghat',
    });
  });

  it('lets Developer create a SuperAdmin', () => {
    const result = authorizeCreateAccount(
      { role: AccountRole.DEVELOPER, sanghat: null },
      { ...userDto, role: AccountRole.SUPER_ADMIN },
    );

    expect(result.role).toBe(AccountRole.SUPER_ADMIN);
  });

  it('lets SuperAdmin create a Developer', () => {
    const result = authorizeCreateAccount(
      { role: AccountRole.SUPER_ADMIN, sanghat: null },
      { ...userDto, role: AccountRole.DEVELOPER },
    );

    expect(result.role).toBe(AccountRole.DEVELOPER);
  });
});

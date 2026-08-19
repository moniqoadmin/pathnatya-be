import { ForbiddenException } from '@nestjs/common';
import {
  authorizeCreateAccount,
  authorizeDeleteAccount,
  authorizeViewAccount,
} from './account-authorization';
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

describe('authorizeViewAccount', () => {
  const user = {
    id: 'user-1',
    role: AccountRole.USER,
    sanghat: 'Pune Sanghat',
  };
  const otherUser = {
    id: 'user-2',
    role: AccountRole.USER,
    sanghat: 'Pune Sanghat',
  };
  const admin = {
    id: 'admin-1',
    role: AccountRole.ADMIN,
    sanghat: 'Pune Sanghat',
  };

  it('lets a User view their own account', () => {
    expect(() => authorizeViewAccount(user, user)).not.toThrow();
  });

  it('rejects a User viewing another account', () => {
    expect(() => authorizeViewAccount(user, otherUser)).toThrow(
      'You can only view your own account',
    );
  });

  it('lets Admin view a User in their sanghat', () => {
    expect(() => authorizeViewAccount(admin, user)).not.toThrow();
  });

  it('rejects Admin viewing a User in another sanghat', () => {
    expect(() =>
      authorizeViewAccount(admin, { ...otherUser, sanghat: 'Mumbai Sanghat' }),
    ).toThrow('Admins can only view accounts in their sanghat');
  });

  it('rejects Admin viewing a SuperAdmin', () => {
    expect(() =>
      authorizeViewAccount(admin, {
        id: 'sa-1',
        role: AccountRole.SUPER_ADMIN,
        sanghat: 'Pune Sanghat',
      }),
    ).toThrow('Admins can only view User accounts');
  });

  it('lets SuperAdmin view any account', () => {
    expect(() =>
      authorizeViewAccount(
        { id: 'sa-1', role: AccountRole.SUPER_ADMIN, sanghat: null },
        user,
      ),
    ).not.toThrow();
  });
});

describe('authorizeDeleteAccount', () => {
  const user = {
    id: 'user-1',
    role: AccountRole.USER,
    sanghat: 'Pune Sanghat',
  };
  const admin = {
    id: 'admin-1',
    role: AccountRole.ADMIN,
    sanghat: 'Pune Sanghat',
  };

  it('rejects User callers, including self-delete', () => {
    expect(() => authorizeDeleteAccount(user, user)).toThrow(
      ForbiddenException,
    );
  });

  it('lets Admin delete a User in their sanghat', () => {
    expect(() => authorizeDeleteAccount(admin, user)).not.toThrow();
  });

  it('rejects Admin deleting a User in another sanghat', () => {
    expect(() =>
      authorizeDeleteAccount(admin, { ...user, sanghat: 'Mumbai Sanghat' }),
    ).toThrow('Admins can only delete accounts in their sanghat');
  });

  it('rejects Admin with no sanghat', () => {
    expect(() =>
      authorizeDeleteAccount({ ...admin, sanghat: null }, user),
    ).toThrow('Admin account has no sanghat assigned');
  });

  it('rejects Admin deleting another Admin', () => {
    expect(() =>
      authorizeDeleteAccount(admin, {
        id: 'admin-2',
        role: AccountRole.ADMIN,
        sanghat: 'Pune Sanghat',
      }),
    ).toThrow('Admins can only delete User accounts');
  });

  it('lets Developer delete a SuperAdmin', () => {
    expect(() =>
      authorizeDeleteAccount(
        { id: 'dev-1', role: AccountRole.DEVELOPER, sanghat: null },
        { id: 'sa-1', role: AccountRole.SUPER_ADMIN, sanghat: null },
      ),
    ).not.toThrow();
  });
});

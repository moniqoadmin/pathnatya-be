import {
  AccountRole,
  hasFixedSingleTeamCount,
  parseAccountRole,
} from './account.entity';

describe('hasFixedSingleTeamCount', () => {
  it('is true for Admin, SuperAdmin, and Developer', () => {
    expect(hasFixedSingleTeamCount(AccountRole.ADMIN)).toBe(true);
    expect(hasFixedSingleTeamCount(AccountRole.SUPER_ADMIN)).toBe(true);
    expect(hasFixedSingleTeamCount(AccountRole.DEVELOPER)).toBe(true);
  });

  it('is false for User', () => {
    expect(hasFixedSingleTeamCount(AccountRole.USER)).toBe(false);
    expect(hasFixedSingleTeamCount(parseAccountRole('user'))).toBe(false);
  });
});

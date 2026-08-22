import { isSupportedPhoneNumber } from './supported-phone-number.validator';

describe('isSupportedPhoneNumber', () => {
  it.each([
    '987654321',
    '9876543210',
    987654321,
    ' 987-654-321 ',
    '987654321.0',
    '9.87654321E+8',
  ])('accepts 9 or 10 digits after cleaning: %j', (value) => {
    expect(isSupportedPhoneNumber(value)).toBe(true);
  });

  it.each(['12345678', '12345678901', '', null, undefined, 'abc'])(
    'rejects values that are not 9 or 10 digits: %j',
    (value) => {
      expect(isSupportedPhoneNumber(value)).toBe(false);
    },
  );
});

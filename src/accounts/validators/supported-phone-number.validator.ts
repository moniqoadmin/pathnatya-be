import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// US, UK and India phone numbers, taken WITHOUT any country-code prefix /
// extension. US, UK (mobile) and India numbers are all 10 digits.
const PHONE_PATTERN = /^\d{10}$/;

export function isSupportedPhoneNumber(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return PHONE_PATTERN.test(value);
}

export function IsSupportedPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSupportedPhoneNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isSupportedPhoneNumber(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a 10-digit US, UK or India phone number with no country code or extension`;
        },
      },
    });
  };
}

import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// US, UK and India phone numbers, taken WITHOUT any country-code prefix /
// extension. Numbers are 9 or 10 digits.
const PHONE_PATTERN = /^\d{9,10}$/;

export function normalizePhoneNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .trim()
    .replace(/\.0(?=\D*$)/, '')
    .replace(/\D/g, '');
}

export function isSupportedPhoneNumber(value: unknown): value is string {
  return PHONE_PATTERN.test(normalizePhoneNumber(value));
}

export function IsSupportedPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    Transform(({ value }) => {
      const normalized = normalizePhoneNumber(value);
      return normalized || value;
    })(object, propertyName);
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
          return `${args.property} must be a 9 or 10-digit US, UK or India phone number with no country code or extension`;
        },
      },
    });
  };
}

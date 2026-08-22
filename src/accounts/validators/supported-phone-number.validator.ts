import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// US, UK and India phone numbers, taken WITHOUT any country-code prefix /
// extension. Numbers are 8, 9 or 10 digits.
const PHONE_PATTERN = /^\d{8,10}$/;

export function normalizePhoneNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(Math.abs(value)).toString();
  }
  const raw = String(value).trim();
  if (!raw) {
    return '';
  }
  // Excel may store phones as 9.87654321E+8 or 987654321.0
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.trunc(Math.abs(parsed)).toString();
    }
  }
  return raw.replace(/\.0+$/, '').replace(/\D/g, '');
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
          return `${args.property} must be an 8, 9 or 10-digit US, UK or India phone number with no country code or extension`;
        },
      },
    });
  };
}

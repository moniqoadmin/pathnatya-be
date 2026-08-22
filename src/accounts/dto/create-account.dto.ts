import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AccountRole, parseAccountRole } from '../entities/account.entity';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class CreateAccountDto {
  @ApiProperty({
    example: '9876543210',
    description:
      '9 or 10-digit phone number for US, UK or India. No country code or extension. Immutable once created.',
  })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    description:
      'Max number of teams / systems allowed for this account. Team rows are created when a new device IP logs in, up to this cap. Defaults to 1 when null.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberOfTeams?: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    default: 0,
    description: 'Number of reboots recorded for this account.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numberOfReboot?: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    default: 1,
    description: 'ID of the app_configurations row assigned to this account.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  appConfiguration?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'When true, the Electron app shows the logout button.',
  })
  @IsOptional()
  @IsBoolean()
  logoutButton?: boolean;

  @ApiPropertyOptional({
    enum: AccountRole,
    default: AccountRole.USER,
    description:
      'Account role. User, SuperAdmin, Admin, or Developer (case-insensitive). Anything else defaults to User. Only SuperAdmin and Developer may set this; Admins always create User accounts.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : parseAccountRole(value),
  )
  @IsEnum(AccountRole)
  role?: AccountRole;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Whether this account is offline-only.',
  })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ example: 'Pune Sanghat' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sanghat?: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jilha?: string;

  @ApiPropertyOptional({ example: 'Haveli' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taluka?: string;

  @ApiPropertyOptional({ example: 'Group A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  group?: string;

  @ApiPropertyOptional({ example: 'Kothrud Kendra' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  kendra?: string;

  @ApiPropertyOptional({ example: 'Ramesh Kulkarni' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sanchalakName?: string;

  @ApiPropertyOptional({
    example: { source: 'curl', kendraType: 'pathnatya' },
    description:
      'Arbitrary JSON metadata. `source` defaults to "curl" when omitted.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountRole, AccountStatus } from '../entities/account.entity';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class CreateAccountDto {
  @ApiProperty({
    example: '9876543210',
    description:
      '10-digit phone number for US, UK or India. No country code or extension. Immutable once created.',
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
    example: false,
    default: false,
    description: 'When true, the client should play video only.',
  })
  @IsOptional()
  @IsBoolean()
  videoOnly?: boolean;

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
    example: 'S3curePass!',
    minLength: 6,
    description:
      'Optional. Ignored on create: team rows are not created until a device IP logs in. The first device should call set-password.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({
    enum: AccountRole,
    default: AccountRole.USER,
    description:
      'Account role. Defaults to User when omitted. Allowed: User, Admin, SuperAdmin, Developer.',
  })
  @IsOptional()
  @IsEnum(AccountRole)
  role?: AccountRole;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether this account is offline-only.',
  })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'When true, the account cannot authenticate: check-phone, login and set-password all fail.',
  })
  @IsOptional()
  @IsBoolean()
  isLoginDisabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'When true, the client should enforce DOM security checks.',
  })
  @IsOptional()
  @IsBoolean()
  domSecurity?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'When true, the client should enable chokidar filesystem watching.',
  })
  @IsOptional()
  @IsBoolean()
  chokidar?: boolean;

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
    example: { source: 'mobile-app', referredBy: 'admin' },
    description: 'Arbitrary JSON metadata.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

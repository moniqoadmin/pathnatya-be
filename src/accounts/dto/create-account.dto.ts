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
import { AccountStatus } from '../entities/account.entity';
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
      'Number of teams / systems allowed for this account. Caps how many IPs can be stored in systemAddress. Defaults to 1 when null.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberOfTeams?: number;

  @ApiPropertyOptional({
    example: 'S3curePass!',
    minLength: 6,
    description:
      'Optional. If provided, setPassword is stored as false. If omitted, the account is created with setPassword=true.',
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
    example: false,
    default: false,
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
    example: { source: 'mobile-app', referredBy: 'admin' },
    description: 'Arbitrary JSON metadata.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

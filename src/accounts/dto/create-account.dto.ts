import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
    maximum: 20,
    description:
      'Number of teams enabled for this account. Team credentials are stored separately in team_access.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  numberOfTeams?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numberOfReboot?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  videoOnly?: boolean;

  @ApiPropertyOptional({ enum: AccountStatus, default: AccountStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ enum: AccountRole, default: AccountRole.USER })
  @IsOptional()
  @IsEnum(AccountRole)
  role?: AccountRole;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isLoginDisabled?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  domSecurity?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
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
    description: 'Arbitrary account-level JSON metadata.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

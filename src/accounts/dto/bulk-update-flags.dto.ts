import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class BulkUpdateFlagsDto {
  @ApiPropertyOptional({
    example: 'Pune Sanghat',
    description:
      'Sanghat name as stored on accounts. Match is case-insensitive and ignores surrounding whitespace. Required unless all=true.',
  })
  @ValidateIf((dto: BulkUpdateFlagsDto) => dto.all !== true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  sanghat?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, queue a job that updates every account. Returns 202 { jobId, status }. Mutually exclusive with sanghat. Poll GET /accounts/sanghats/flags/jobs/:jobId.',
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'When true, the Electron app shows the logout button.',
  })
  @IsOptional()
  @IsBoolean()
  logoutButton?: boolean;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description:
      'ID of the app_configurations row assigned to matching accounts.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  appConfiguration?: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    description: 'Number of reboots recorded for matching accounts.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numberOfReboot?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether matching accounts are offline-only.',
  })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'When true, every team under matching accounts cannot authenticate. Enabling login (false) requires reason.',
  })
  @IsOptional()
  @IsBoolean()
  isLoginDisabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, every team under matching accounts must set a password again (hashes and bound system addresses are cleared). setPassword=false is not allowed in bulk.',
  })
  @IsOptional()
  @IsBoolean()
  @Equals(true, {
    message: 'setPassword=false must be done per team after a password is set',
  })
  setPassword?: boolean;

  @ApiPropertyOptional({
    example:
      'User completed the required follow-up after the previous login block.',
    description:
      'Required when enabling login (isLoginDisabled=false). Stored as the USER_ENABLED audit-trail message.',
  })
  @ValidateIf((dto: BulkUpdateFlagsDto) => dto.isLoginDisabled === false)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;
}

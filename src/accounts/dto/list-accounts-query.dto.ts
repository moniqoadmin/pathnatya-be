import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AccountRole } from '../entities/account.entity';

export class ListAccountsQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Optional client flag (e.g. admin UI). Accepted when present; not required.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  admin?: boolean;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    default: 1,
    description: '1-based page number.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Number of accounts per page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'Kothrud',
    description: 'Search by phone number or kendra name (partial match).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: AccountRole,
    description:
      'Filter by role. SuperAdmin only; Admins always receive User accounts.',
  })
  @IsOptional()
  @IsEnum(AccountRole)
  role?: AccountRole;
}

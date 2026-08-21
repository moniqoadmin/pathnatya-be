import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { OptionalAdminQueryDto } from './optional-admin-query.dto';

export class LoginAnalyticsQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({
    example: 'Pune Sanghat',
    description:
      'Limit counts to one sanghat. Match is case-insensitive and ignores surrounding whitespace.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sanghat?: string;

  @ApiPropertyOptional({
    example: '2026-08-21T00:00:00.000Z',
    description:
      'Only count teams whose lastLoginTime is at or after this UTC time. Omit to count any successful login.',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;
}

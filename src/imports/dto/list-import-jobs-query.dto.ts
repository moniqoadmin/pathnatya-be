import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OptionalAdminQueryDto } from '../../accounts/dto/optional-admin-query.dto';
import { AccountImportJobStatus } from '../entities/account-import-job.entity';

export class ListImportJobsQueryDto extends OptionalAdminQueryDto {
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
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Number of import jobs per page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    enum: AccountImportJobStatus,
    description:
      'Filter by job status. Omit to return all statuses.',
  })
  @IsOptional()
  @IsEnum(AccountImportJobStatus)
  status?: AccountImportJobStatus;
}

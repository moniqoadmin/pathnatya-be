import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OptionalAdminQueryDto } from '../../accounts/dto/optional-admin-query.dto';
import { MergeErrorStatus, MergeFileStatus } from '../excel-merge.types';

export enum ListSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export const MERGE_TASK_SORT_FIELDS = [
  'name',
  'description',
  'createdAt',
  'updatedAt',
] as const;

export const MERGE_FILE_SORT_FIELDS = [
  'fileName',
  'fileSize',
  'status',
  'selectedSheet',
  'headerRow',
  'totalRows',
  'validCount',
  'errorCount',
  'createdAt',
  'updatedAt',
  'processedAt',
] as const;

/** Row fields the UI can sort besides an output column key. */
export const MERGE_ROW_SORT_FIELDS = [
  'createdAt',
  'sourceRowNumber',
  'fileName',
] as const;

export const MERGE_ERROR_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'sourceRowNumber',
  'fileName',
  'status',
] as const;

export class ListMergeTasksQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    enum: MERGE_TASK_SORT_FIELDS,
    description: 'name, description, createdAt, or updatedAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(MERGE_TASK_SORT_FIELDS)
  sort?: string;

  @ApiPropertyOptional({ enum: ListSortOrder })
  @IsOptional()
  @IsEnum(ListSortOrder)
  order?: ListSortOrder;
}

export class ListMergeFilesQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: MergeFileStatus })
  @IsOptional()
  @IsEnum(MergeFileStatus)
  status?: MergeFileStatus;

  @ApiPropertyOptional({
    enum: MERGE_FILE_SORT_FIELDS,
    description:
      'fileName, fileSize, status, selectedSheet, headerRow, totalRows, validCount, errorCount, createdAt, updatedAt, or processedAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(MERGE_FILE_SORT_FIELDS)
  sort?: string;

  @ApiPropertyOptional({ enum: ListSortOrder })
  @IsOptional()
  @IsEnum(ListSortOrder)
  order?: ListSortOrder;
}

export class ListTaskDataQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({
    description: 'Filter rows that came from this uploaded file',
  })
  @IsOptional()
  fileId?: string;

  @ApiPropertyOptional({
    example: 'city',
    description:
      'Any output column key, or createdAt, sourceRowNumber, or fileName',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  sort?: string;

  @ApiPropertyOptional({ enum: ListSortOrder })
  @IsOptional()
  @IsEnum(ListSortOrder)
  order?: ListSortOrder;
}

export class ExportTaskDataQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({
    example: 'city',
    description:
      'Any output column key, or createdAt, sourceRowNumber, or fileName. Defaults to createdAt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  sort?: string;

  @ApiPropertyOptional({ enum: ListSortOrder })
  @IsOptional()
  @IsEnum(ListSortOrder)
  order?: ListSortOrder;

  @ApiPropertyOptional({
    example: 'taluka_name',
    description:
      'Saves this as the summary row column for the task, then uses it on the Summary sheet.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  rowColumn?: string;

  @ApiPropertyOptional({
    example: 'group_name',
    description:
      'Saves this as the summary column headers for the task, then uses it on the Summary sheet.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  columnColumn?: string;

  @ApiPropertyOptional({
    example: 'Total',
    description: 'Label of the total column on the Summary sheet. Saved on the task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  totalLabel?: string;
}

export class ListTaskErrorsQueryDto extends OptionalAdminQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({
    enum: MergeErrorStatus,
    description: 'Defaults to pending',
  })
  @IsOptional()
  @IsEnum(MergeErrorStatus)
  status?: MergeErrorStatus;

  @IsOptional()
  fileId?: string;

  @ApiPropertyOptional({
    example: 'city',
    description:
      'Any output column key, or createdAt, updatedAt, sourceRowNumber, fileName, or status',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  sort?: string;

  @ApiPropertyOptional({ enum: ListSortOrder })
  @IsOptional()
  @IsEnum(ListSortOrder)
  order?: ListSortOrder;
}

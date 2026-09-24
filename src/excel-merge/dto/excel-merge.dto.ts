import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Allow,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TaskColumnDataType } from '../excel-merge.types';

export class CreateTaskColumnDto {
  @ApiProperty({ example: 'Kendra Name' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiPropertyOptional({
    enum: TaskColumnDataType,
    default: TaskColumnDataType.STRING,
  })
  @IsOptional()
  @IsEnum(TaskColumnDataType)
  dataType?: TaskColumnDataType;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Mark this as the task primary column. Later files treat a repeated value as a duplicate. Only one column can be primary.',
  })
  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class AddTaskColumnsDto {
  @ApiProperty({ type: [CreateTaskColumnDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskColumnDto)
  columns: CreateTaskColumnDto[];
}

export class CreateMergeTaskDto {
  @ApiProperty({ example: 'Janmashtami 2026 Kendra Data' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Combined kendra reports for Janmashtami' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [CreateTaskColumnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskColumnDto)
  columns?: CreateTaskColumnDto[];
}

export class SummaryFilterDto {
  @ApiProperty({ example: 'kendra_type' })
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  column: string;

  @ApiProperty({
    example: 'Yuva Kendra',
    description: 'Text, number, or yes/no value the column must equal',
  })
  @IsDefined()
  @Allow()
  equals: string | number | boolean;
}

export class SummaryMetricDto {
  @ApiProperty({ example: 'Total Number of Kendra' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiProperty({ enum: ['count', 'sum'] })
  @IsEnum(['count', 'sum'])
  op: 'count' | 'sum';

  @ApiPropertyOptional({
    example: 'expected_teams',
    description: 'Number column to add. Required when op is sum.',
  })
  @ValidateIf((metric: SummaryMetricDto) => metric.op === 'sum')
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  column?: string;

  @ApiPropertyOptional({ type: [SummaryFilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryFilterDto)
  when?: SummaryFilterDto[];
}

export class SaveTaskSummaryDto {
  @ApiProperty({
    example: 'taluka_name',
    description:
      'Output column whose unique values each become a block, where Pune sits on the Zilla sheet.',
  })
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  rowColumn: string;

  @ApiProperty({
    example: 'group_name',
    description:
      'Output column whose unique values become the headers inside each block, where Zone 1 and Zone 2 sit.',
  })
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  columnColumn: string;

  @ApiProperty({ example: 'Total' })
  @IsString()
  @MaxLength(80)
  totalLabel: string;

  @ApiProperty({ type: [SummaryMetricDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SummaryMetricDto)
  metrics: SummaryMetricDto[];
}

export class UpdateMergeTaskDto {
  @ApiPropertyOptional({ example: 'Janmashtami 2026 Kendra Data' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTaskColumnDto {
  @ApiPropertyOptional({ example: 'Mobile Number' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ enum: TaskColumnDataType })
  @IsOptional()
  @IsEnum(TaskColumnDataType)
  dataType?: TaskColumnDataType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, this becomes the only primary column. Later files reject rows whose primary value is already merged or repeated in the file. Other column checks still apply.',
  })
  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class MappingItemDto {
  @ApiProperty({ example: 'Contact Number' })
  @IsString()
  sourceHeader: string;

  @ApiProperty({
    enum: ['map', 'ignore', 'create'],
    description:
      'map = use an existing output column, create = add a new output column, ignore = exclude this source column',
  })
  @IsEnum(['map', 'ignore', 'create'])
  action: 'map' | 'ignore' | 'create';

  @ApiPropertyOptional({
    example: 'mobile_number',
    description: 'Existing output column key. Required when action is map',
  })
  @IsOptional()
  @IsString()
  columnKey?: string;

  @ApiPropertyOptional({
    example: 'Mobile Number',
    description:
      'Output column name when action is create. Defaults to the source header',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ enum: TaskColumnDataType })
  @IsOptional()
  @IsEnum(TaskColumnDataType)
  dataType?: TaskColumnDataType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description:
      'When action is create, mark the new output column as the task primary column.',
  })
  @IsOptional()
  @IsBoolean()
  primary?: boolean;
}

export class ConfirmMappingDto {
  @ApiPropertyOptional({
    example: 'Sheet1',
    description: 'Override the detected data sheet before processing',
  })
  @IsOptional()
  @IsString()
  sheetName?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Override the detected header row (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headerRow?: number;

  @ApiProperty({ type: [MappingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MappingItemDto)
  mappings: MappingItemDto[];

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'When true, process the file immediately after saving the mapping',
  })
  @IsOptional()
  @IsBoolean()
  process?: boolean;
}

export class UpdateTaskDataDto {
  @ApiProperty({
    example: { city: 'Nashik', quantity: 4 },
    description:
      'Updated values keyed by output column key. Columns omitted here stay as they are. Original uploaded values are not changed.',
  })
  @IsObject()
  values: Record<string, unknown>;
}

export class CreateTaskDataDto {
  @ApiProperty({
    example: { name: 'Neha', mobile_number: '9666666666', city: 'Nashik' },
    description: 'Values keyed by output column key.',
  })
  @IsObject()
  values: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Uploaded file this row belongs to. Omit when the row is added directly to the merged data.',
  })
  @IsOptional()
  @IsUUID('4')
  fileId?: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'Original Excel row number, when this row came from a file.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceRowNumber?: number;
}

export class BulkCreateTaskDataDto {
  @ApiProperty({ type: [CreateTaskDataDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDataDto)
  rows: CreateTaskDataDto[];
}

export class BulkTaskDataChangeDto {
  @ApiProperty({ example: '3f1c2a40-6b2e-4c1a-9d0e-1a2b3c4d5e6f' })
  @IsUUID('4')
  id: string;

  @ApiProperty({
    example: { city: 'Nashik' },
    description:
      'Updated values keyed by output column key. Columns omitted here stay as they are.',
  })
  @IsObject()
  values: Record<string, unknown>;
}

export class BulkUpdateTaskDataDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Apply the same values to each of these rows. Do not send this together with rows.',
  })
  @ValidateIf((dto: BulkUpdateTaskDataDto) => !dto.rows?.length)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    example: { city: 'Pune' },
    description: 'Values applied to every id. Required when ids is sent.',
  })
  @ValidateIf((dto: BulkUpdateTaskDataDto) => !dto.rows?.length)
  @IsObject()
  values?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: [BulkTaskDataChangeDto],
    description:
      'Per-row updates. Each row can change different columns. Do not send this together with ids.',
  })
  @ValidateIf((dto: BulkUpdateTaskDataDto) => !dto.ids?.length)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkTaskDataChangeDto)
  rows?: BulkTaskDataChangeDto[];
}

export class DeleteTaskDataDto {
  @ApiProperty({
    type: [String],
    example: ['3f1c2a40-6b2e-4c1a-9d0e-1a2b3c4d5e6f'],
    description: 'Merged data row ids to delete',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class UpdateTaskErrorDto {
  @ApiProperty({
    example: { mobile_number: '9876543210', teams: 4 },
    description: 'Corrected values keyed by output column key',
  })
  @IsObject()
  values: Record<string, unknown>;

  @ApiPropertyOptional({
    example: true,
    description: 'When true, re-validate and move to main data if valid',
  })
  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}

export class DeleteTaskErrorsDto {
  @ApiProperty({
    type: [String],
    example: ['3f1c2a40-6b2e-4c1a-9d0e-1a2b3c4d5e6f'],
    description: 'Pending error row ids to delete',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}

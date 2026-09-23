import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
      'map = use an existing master column, create = add a new master column, ignore = skip this uploaded column',
  })
  @IsEnum(['map', 'ignore', 'create'])
  action: 'map' | 'ignore' | 'create';

  @ApiPropertyOptional({
    example: 'mobile_number',
    description: 'Required when action is map',
  })
  @IsOptional()
  @IsString()
  columnKey?: string;

  @ApiPropertyOptional({
    example: 'Mobile Number',
    description: 'Required when action is create',
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

export class UpdateTaskErrorDto {
  @ApiProperty({
    example: { mobile_number: '9876543210', teams: 4 },
    description: 'Corrected values keyed by master column key',
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

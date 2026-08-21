import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { VideoConfigDto } from './video-config.dto';

export class UpdateAppConfigurationDto {
  @ApiPropertyOptional({
    example: 2,
    description:
      'New numeric id for this row. Accounts that referenced the old id are remapped.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiPropertyOptional({ type: VideoConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => VideoConfigDto)
  videoConfig?: VideoConfigDto;

  @ApiPropertyOptional({ type: [Object], example: [] })
  @IsOptional()
  @IsArray()
  videoFiles?: Record<string, unknown>[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, Min, ValidateNested } from 'class-validator';
import { VideoConfigDto } from './video-config.dto';

export class UpsertAppConfigurationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ type: VideoConfigDto })
  @IsObject()
  @ValidateNested()
  @Type(() => VideoConfigDto)
  videoConfig: VideoConfigDto;

  @ApiProperty({ type: [Object], example: [] })
  @IsArray()
  videoFiles: Record<string, unknown>[];
}

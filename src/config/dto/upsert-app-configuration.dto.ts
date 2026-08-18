import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, Min } from 'class-validator';
import { VideoConfig } from '../entities/app-configuration.entity';

export class UpsertAppConfigurationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({
    example: {
      DEFAULT_HLS_SOURCE:
        'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
      ALLOWED_HOSTS: ['pathnatya-video-cdn.b-cdn.net'],
    },
  })
  @IsObject()
  videoConfig: VideoConfig;

  @ApiProperty({ type: [Object], example: [] })
  @IsArray()
  videoFiles: Record<string, unknown>[];
}

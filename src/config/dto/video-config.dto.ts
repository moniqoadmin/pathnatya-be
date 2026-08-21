import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { VideoConfig } from '../entities/app-configuration.entity';

export class VideoConfigDto implements VideoConfig {
  @ApiProperty({
    example:
      'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
  })
  @IsString()
  @IsNotEmpty()
  DEFAULT_HLS_SOURCE: string;

  @ApiProperty({
    type: [String],
    example: ['pathnatya-video-cdn.b-cdn.net'],
  })
  @IsArray()
  @IsString({ each: true })
  ALLOWED_HOSTS: string[];
}

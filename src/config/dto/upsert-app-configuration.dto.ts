import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Min } from 'class-validator';

export class UpsertAppConfigurationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({
    description: 'Arbitrary JSON stored as video_config.',
    example: {
      DEFAULT_HLS_SOURCE:
        'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
      ALLOWED_HOSTS: ['pathnatya-video-cdn.b-cdn.net'],
    },
  })
  @IsDefined()
  videoConfig: unknown;

  @ApiProperty({
    description: 'Arbitrary JSON stored as video_files.',
    example: [],
  })
  @IsDefined()
  videoFiles: unknown;
}

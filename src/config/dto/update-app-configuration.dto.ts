import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Arbitrary JSON stored as video_config.',
    example: {
      DEFAULT_HLS_SOURCE:
        'https://pathnatya-video-cdn.b-cdn.net/video-001/playlist.m3u8',
      ALLOWED_HOSTS: ['pathnatya-video-cdn.b-cdn.net'],
    },
  })
  @IsOptional()
  videoConfig?: unknown;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON stored as video_files.',
    example: [],
  })
  @IsOptional()
  videoFiles?: unknown;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLogDto {
  @ApiProperty({
    example: 'video_playback_started',
    description:
      'Event name / type being logged. FILES_TAMPERED disables login for the matching device team (by ipAddress MAC), not the whole account.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  event: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether the client detected tampering for this event.',
  })
  @IsOptional()
  @IsBoolean()
  tampered?: boolean;

  @ApiPropertyOptional({
    example: 'AA:BB:CC:DD:EE:FF',
    description:
      'Device MAC address (field name is ipAddress). Required when event is FILES_TAMPERED so only that team is disabled.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @ApiPropertyOptional({
    example: { videoId: 'abc', durationSeconds: 120 },
    description: 'Arbitrary JSON metadata for this log event.',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

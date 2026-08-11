import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLogDto {
  @ApiProperty({
    example: 'video_playback_started',
    description: 'Event name / type being logged.',
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
}

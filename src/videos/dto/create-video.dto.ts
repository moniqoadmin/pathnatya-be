import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVideoDto {
  @ApiProperty({ example: 'das' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  videoId: string;

  @ApiProperty({ example: 'das.mp4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  source: string;

  @ApiProperty({ example: 165601281 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  sourceBytes: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  segmentDurationSeconds: number;

  @ApiProperty({ example: 36 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  segmentCount: number;

  @ApiProperty({ example: 1058.219827 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  totalDurationSeconds: number;

  @ApiProperty({ example: 'aes-256-gcm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  algorithm: string;

  @ApiProperty({ example: 'PATHVID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  header: string;

  @ApiProperty({ example: 'sha256(passphrase)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  keyDerivation: string;

  @ApiProperty({ example: 'local/das' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  localDir: string;
}

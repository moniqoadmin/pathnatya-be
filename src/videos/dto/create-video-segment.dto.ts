import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PartOrdersDto {
  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  local: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  remote: number;
}

/** Segment fields without videoId (used inside bulk uploads). */
export class VideoSegmentFieldsDto {
  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  segmentNumber: number;

  @ApiProperty({ example: 'eng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  languageName: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startTime: number;

  @ApiProperty({ example: 30.016674 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationSeconds: number;

  @ApiProperty({ example: 6039588 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  encryptedBytes: number;

  @ApiProperty({ example: 4481978 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localBytes: number;

  @ApiProperty({ example: 1557610 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remoteBytes: number;

  @ApiProperty({ example: 4481978 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  splitAt: number;

  @ApiProperty({ example: 0.7420999578116918 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localRatio: number;

  @ApiProperty({ example: 0.2579 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remoteRatio: number;

  @ApiProperty({ example: 'local/das/eng.bin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  localFile: string;

  @ApiProperty({
    example:
      '22ad4f6eff84011ae6a71a5e6063e2b3c2124040b199b873b0ecc244e2a14195',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  hash: string;

  @ApiProperty({
    example: { local: 0, remote: 1 },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => PartOrdersDto)
  partOrders: PartOrdersDto;

  @ApiProperty({
    description: 'Base64-encoded remote payload (can be several MB).',
    example: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  })
  @IsString()
  @IsNotEmpty()
  remoteData: string;
}

/** Single-segment create body (videoId on the segment). */
export class CreateVideoSegmentDto extends VideoSegmentFieldsDto {
  @ApiProperty({ example: 'das' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  videoId: string;
}

/** Bulk create: one videoId applied to every segment in the array. */
export class BulkCreateVideoSegmentsDto {
  @ApiProperty({ example: 'das' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  videoId: string;

  @ApiProperty({ type: [VideoSegmentFieldsDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VideoSegmentFieldsDto)
  segments: VideoSegmentFieldsDto[];
}

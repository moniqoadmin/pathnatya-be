import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class SetPasswordDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ example: 'S3curePass!', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamNumber?: number;

  @ApiPropertyOptional({ example: 'device-identifier-or-mac' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  systemAddress?: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class LoginDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  teamNumber: number;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ipAddress?: string;
}

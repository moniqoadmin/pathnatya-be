import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class SetPasswordDto {
  @ApiProperty({
    example: '9876543210',
    description: '9 or 10-digit phone number. No country code or extension.',
  })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ example: 'S3curePass!', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'AA:BB:CC:DD:EE:FF' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @ApiPropertyOptional({
    example: { deviceName: 'kendra-hall-1', os: 'darwin' },
    description: 'Arbitrary JSON metadata stored on this device team.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

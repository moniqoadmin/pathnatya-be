import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
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
}

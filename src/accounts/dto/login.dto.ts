import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class LoginDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

@Transform(({ value }) =>
  plainToInstance(SetPasswordDto, {
    ...value,
    ipAddress: value?.ipAddress ?? value?.ipaddress,
    ipaddress: undefined,
  }),
)
export class SetPasswordDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ example: 'S3curePass!', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class CheckPhoneDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;
}

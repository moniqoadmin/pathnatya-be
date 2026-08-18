import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSupportedPhoneNumber } from '../validators/supported-phone-number.validator';

export class CheckPhoneDto {
  @ApiProperty({ example: '9876543210' })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiPropertyOptional({
    example: 'AA:BB:CC:DD:EE:FF',
    description:
      'Device MAC address (field name is ipAddress). Used to match an existing team.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;
}

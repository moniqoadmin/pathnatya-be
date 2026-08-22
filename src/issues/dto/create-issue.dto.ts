import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsSupportedPhoneNumber } from '../../accounts/validators/supported-phone-number.validator';

export class CreateIssueDto {
  @ApiProperty({
    example: '9876543210',
    description:
      '8, 9 or 10-digit phone number of the account this issue is for. Admins may send a User phone number to report on their behalf.',
  })
  @IsSupportedPhoneNumber()
  phoneNumber: string;

  @ApiProperty({
    example: 'Unable to play the assigned video on this system.',
    description: 'Description of the issue from the reporter.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    example: [1, 4],
    type: [Number],
    required: false,
    description: 'Optional issue codes selected from the catalog PDF.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  issueNumbers?: number[];
}

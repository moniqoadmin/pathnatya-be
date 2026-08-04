import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

export class EncryptPayloadDto {
  @ApiProperty({
    description: 'Arbitrary JSON value to encrypt (object, array, string, number, etc.).',
    example: { phoneNumber: '9876543210', password: 'S3curePass!' },
  })
  @IsDefined()
  data: unknown;
}

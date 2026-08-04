import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DecryptPayloadDto {
  @ApiProperty({
    description:
      'Compact JWE string (alg: dir, enc: A256GCM) produced by POST /crypto/encrypt or the payload encryption layer.',
    example: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..',
  })
  @IsString()
  @IsNotEmpty()
  payload: string;
}

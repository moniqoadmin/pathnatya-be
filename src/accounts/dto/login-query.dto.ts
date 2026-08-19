import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class LoginQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'When true, the issued session token expires in 2 hours (admin UI). Otherwise the token is valid for 5 days.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  admin?: boolean;
}

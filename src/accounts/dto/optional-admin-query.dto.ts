import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Optional `admin` query flag sent by the admin UI. */
export class OptionalAdminQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Optional client flag (e.g. admin UI). Accepted when present; not required.',
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

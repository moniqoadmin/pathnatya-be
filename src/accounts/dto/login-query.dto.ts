import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class LoginQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'When true, the issued session token expires in 2 hours (admin UI) and device ipAddress matching is skipped. Otherwise the token is valid for 5 days. Admin / SuperAdmin / Developer always receive a token on this path. On the Electron path (admin omitted or false), those roles are allowed only when entitlement ADMIN_LOGIN_ELECTRON_APP is enabled.',
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

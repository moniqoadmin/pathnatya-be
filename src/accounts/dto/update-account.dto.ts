import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAccountDto } from './create-account.dto';

// phoneNumber is intentionally omitted: it cannot be changed once the account
// is created.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['phoneNumber'] as const),
) {
  @ApiPropertyOptional({
    example: true,
    description:
      'When true, the account must set a password again (password hash is cleared). Admins may only change this from false to true.',
  })
  @IsOptional()
  @IsBoolean()
  setPassword?: boolean;
}

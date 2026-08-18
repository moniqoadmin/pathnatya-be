import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreateAccountDto } from './create-account.dto';
import { UpdateTeamDto } from './update-team.dto';

// phoneNumber is intentionally omitted: it cannot be changed once the account
// is created.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['phoneNumber'] as const),
) {
  @ApiPropertyOptional({
    example: true,
    description:
      'When true, every team on this account must set a password again (hashes are cleared). Admins may only change this from false to true. Prefer teams[].setPassword to reset one team.',
  })
  @IsOptional()
  @IsBoolean()
  setPassword?: boolean;

  @ApiPropertyOptional({
    type: [UpdateTeamDto],
    description: 'Per-team updates (password reset, login disable, password).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateTeamDto)
  teams?: UpdateTeamDto[];
}

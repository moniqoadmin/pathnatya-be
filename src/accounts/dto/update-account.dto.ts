import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAccountDto } from './create-account.dto';

// phoneNumber is immutable; team authentication fields live in team_access.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['phoneNumber'] as const),
) {}

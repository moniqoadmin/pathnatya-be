import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAccountDto } from './create-account.dto';

// phoneNumber is immutable. Team passwords/device binding are managed through
// team-aware auth endpoints and are not account-level fields.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['phoneNumber'] as const),
) {}

import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAccountDto } from './create-account.dto';

// phoneNumber is intentionally omitted: it cannot be changed once the account
// is created.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['phoneNumber'] as const),
) {}

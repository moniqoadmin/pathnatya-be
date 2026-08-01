import { SetMetadata } from '@nestjs/common';

export const SKIP_PAYLOAD_ENCRYPTION_KEY = 'skipPayloadEncryption';

/** Skip request/response payload encryption for this route (e.g. health, binary downloads). */
export const SkipPayloadEncryption = () =>
  SetMetadata(SKIP_PAYLOAD_ENCRYPTION_KEY, true);

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip JWE auth for this route (e.g. login, check-phone). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

import { JweTokenPayload } from '../accounts/jwe.service';

declare global {
  namespace Express {
    interface Request {
      user?: JweTokenPayload;
    }
  }
}

export {};

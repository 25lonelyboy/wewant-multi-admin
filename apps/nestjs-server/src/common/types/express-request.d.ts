import type { AuthUser } from '../../modules/auth/auth-user.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
    }
  }
}

export {};

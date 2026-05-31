import 'express-serve-static-core';
import type { JwtUser } from '../auth/types.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtUser;
  }
}

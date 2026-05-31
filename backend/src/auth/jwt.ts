import jwt from 'jsonwebtoken';
import type { JwtUser } from './types.js';

function getSecret(): jwt.Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export function signToken(user: JwtUser) {
  return jwt.sign(user, getSecret(), { expiresIn: '12h' });
}

export function verifyToken(token: string): JwtUser {
  const decoded = jwt.verify(token, getSecret());
  return decoded as unknown as JwtUser;
}

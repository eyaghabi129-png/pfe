import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { signToken } from '../auth/jwt.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const db = getDb();

  const r = await db.query(
    `select id, email, password_hash, full_name, role from users where email = $1`,
    [email.toLowerCase()],
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ sub: user.id, email: user.email, role: user.role, fullName: user.full_name });
  return res.json({ token });
});

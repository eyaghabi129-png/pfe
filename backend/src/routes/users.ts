import { Router } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.user!.sub;
  const r = await db.query(`select id, email, full_name, role, created_at from users where id = $1`, [userId]);
  return res.json({ user: r.rows[0] ?? null });
});

usersRouter.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const r = await db.query(`select id, email, full_name, role, created_at from users order by created_at desc limit 200`);
  return res.json({ users: r.rows });
});

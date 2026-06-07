import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const db = getDb();
  const r = await db.query(
    `select id, email, full_name, role, is_active, created_at from users where id = $1`,
    [req.user!.sub],
  );
  return res.json({ user: r.rows[0] ?? null });
});

usersRouter.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const r = await db.query(
    `select id, email, full_name, role, is_active, created_at from users order by created_at desc limit 200`,
  );
  return res.json({ users: r.rows });
});

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
  role: z.enum(['admin', 'manager', 'user']),
  password: z.string().min(6),
});

usersRouter.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { email, full_name, role, password } = parsed.data;
  const db = getDb();

  const exists = await db.query(`select id from users where email = $1`, [email]);
  if (exists.rows.length > 0) return res.status(409).json({ error: 'Email déjà utilisé' });

  const password_hash = await bcrypt.hash(password, 10);
  const r = await db.query(
    `insert into users (email, password_hash, full_name, role) values ($1,$2,$3,$4)
     returning id, email, full_name, role, is_active, created_at`,
    [email, password_hash, full_name, role],
  );
  return res.status(201).json({ user: r.rows[0] });
});

const updateSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  role: z.enum(['admin', 'manager', 'user']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

usersRouter.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { full_name, role, is_active, password } = parsed.data;
  const db = getDb();

  const exists = await db.query(`select id from users where id = $1`, [req.params.id]);
  if (exists.rows.length === 0) return res.status(404).json({ error: 'Employé introuvable' });

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (full_name !== undefined) { sets.push(`full_name = $${idx++}`); vals.push(full_name); }
  if (role !== undefined)      { sets.push(`role = $${idx++}`);      vals.push(role); }
  if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(is_active); }
  if (password !== undefined)  {
    const hash = await bcrypt.hash(password, 10);
    sets.push(`password_hash = $${idx++}`);
    vals.push(hash);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });

  vals.push(req.params.id);
  const r = await db.query(
    `update users set ${sets.join(', ')} where id = $${idx}
     returning id, email, full_name, role, is_active, created_at`,
    vals,
  );
  return res.json({ user: r.rows[0] });
});

usersRouter.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();

  const target = await db.query(`select id, role from users where id = $1`, [req.params.id]);
  if (target.rows.length === 0) return res.status(404).json({ error: 'Employé introuvable' });

  // Prevent deleting the last admin
  if (target.rows[0].role === 'admin') {
    const adminCount = await db.query(`select count(*) from users where role = 'admin' and is_active = true`);
    if (Number(adminCount.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
    }
  }

  // Prevent self-deletion
  if (target.rows[0].id === req.user!.sub) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  await db.query(`delete from users where id = $1`, [req.params.id]);
  return res.status(204).send();
});

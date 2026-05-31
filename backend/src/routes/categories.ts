import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/client.js';

export const categoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

// GET /categories
categoriesRouter.get('/', requireAuth, async (_req, res) => {
  const db = getDb();
  const r = await db.query(`select id, name, description from document_categories order by name`);
  res.json({ categories: r.rows });
});

// POST /categories — ajouter catégorie
categoriesRouter.post('/', requireAuth, async (req, res) => {
  const user = req.user!;
  if (user.role !== 'admin' && user.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const db = getDb();
  const r = await db.query(
    `insert into document_categories (name, description) values ($1, $2) returning id, name, description`,
    [parsed.data.name, parsed.data.description ?? null],
  );
  res.status(201).json({ category: r.rows[0] });
});

// PUT /categories/:id — modifier catégorie
categoriesRouter.put('/:id', requireAuth, async (req, res) => {
  const user = req.user!;
  if (user.role !== 'admin' && user.role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

  const db = getDb();
  const r = await db.query(
    `update document_categories set name=$2, description=$3 where id=$1 returning id, name, description`,
    [req.params.id, parsed.data.name, parsed.data.description ?? null],
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ category: r.rows[0] });
});

// DELETE /categories/:id
categoriesRouter.delete('/:id', requireAuth, async (req, res) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const db = getDb();
  await db.query(`delete from document_categories where id=$1`, [req.params.id]);
  res.status(204).send();
});

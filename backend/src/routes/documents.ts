import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/client.js';
import { s3, S3_BUCKET } from '../storage/s3.js';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { analyzeDocument } from '../services/ai.js';

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const createDocSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

documentsRouter.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;

  const q = String(req.query.q ?? '').trim();
  const tag = String(req.query.tag ?? '').trim();
  const categoryId = String(req.query.categoryId ?? '').trim();

  const where: string[] = [];
  const params: any[] = [];

  if (user.role !== 'admin') {
    params.push(user.sub);
    where.push(`owner_user_id = $${params.length}`);
  }

  if (categoryId) {
    params.push(categoryId);
    where.push(`category_id = $${params.length}`);
  }
  if (tag) {
    params.push(tag);
    where.push(`$${params.length} = any(tags)`);
  }
  if (q) {
    params.push(q);
    where.push(`tsv @@ websearch_to_tsquery('simple', unaccent($${params.length}))`);
  }

  const sqlWhere = where.length ? `where ${where.join(' and ')}` : '';
  const r = await db.query(
    `select id, title, description, tags, category_id, original_filename, content_type, size_bytes, ai_label, ai_confidence, summary, created_at, updated_at
     from documents
     ${sqlWhere}
     order by created_at desc
     limit 200`,
    params,
  );

  res.json({ documents: r.rows });
});

documentsRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const parsed = createDocSchema.safeParse({
    title: req.body.title,
    description: req.body.description,
    categoryId: req.body.categoryId || null,
    tags: req.body.tags ? JSON.parse(req.body.tags) : [],
  });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  if (!req.file) return res.status(400).json({ error: 'Missing file' });

  const db = getDb();
  const user = req.user!;

  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const idRes = await db.query(
    `insert into documents (owner_user_id, title, description, category_id, tags, original_filename, content_type, size_bytes, storage_key, sha256, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'processing')
     returning id`,
    [
      user.sub,
      parsed.data.title,
      parsed.data.description ?? null,
      parsed.data.categoryId ?? null,
      parsed.data.tags,
      req.file.originalname,
      req.file.mimetype || 'application/octet-stream',
      req.file.size,
      `documents/${user.sub}/${crypto.randomUUID()}-${req.file.originalname}`,
      sha256,
    ],
  );

  const docId: string = idRes.rows[0].id;
  const storageKey = (await db.query(`select storage_key from documents where id=$1`, [docId])).rows[0].storage_key as string;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }),
  );

  // call AI synchronously for now (can be moved to queue later)
  try {
    const ai = await analyzeDocument({
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      bytesBase64: req.file.buffer.toString('base64'),
    });

    await db.query(
      `update documents
       set status='ready', ocr_text=$2, summary=$3, ai_label=$4, ai_confidence=$5, updated_at=now()
       where id=$1`,
      [docId, ai.ocr_text ?? null, ai.summary ?? null, ai.label ?? null, ai.confidence ?? null],
    );
  } catch {
    await db.query(`update documents set status='failed', updated_at=now() where id=$1`, [docId]);
  }

  res.status(201).json({ id: docId });
});

documentsRouter.get('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  const r = await db.query(`select * from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  res.json({ document: doc });
});

documentsRouter.get('/:id/download', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  const r = await db.query(`select id, owner_user_id, storage_key, original_filename, content_type from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: doc.storage_key, ResponseContentDisposition: `attachment; filename=\"${doc.original_filename}\"` }),
    { expiresIn: 60 },
  );

  res.json({ url });
});

documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  const r = await db.query(`select id, owner_user_id, storage_key from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: doc.storage_key }));
  await db.query(`delete from documents where id=$1`, [id]);

  res.status(204).send();
});

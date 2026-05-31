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
import { recordAction } from '../services/historique.js';

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const createDocSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

const updateDocSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

// GET /documents — list with full-text search, tag filter, category filter
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
    `select id, title, description, tags, category_id, original_filename, content_type, size_bytes, ai_label, ai_confidence, summary, status, created_at, updated_at
     from documents
     ${sqlWhere}
     order by created_at desc
     limit 200`,
    params,
  );

  res.json({ documents: r.rows });
});

// POST /documents — upload + AI analyze (with duplicate sha256 check)
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

  // Vérifier existence document (sequence diagram: Ajouter document)
  const existing = await db.query(
    `select id from documents where sha256 = $1 and owner_user_id = $2`,
    [sha256, user.sub],
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Document déjà existant', existingId: existing.rows[0].id });
  }

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

    // Construire index IA avec mots-clés extraits
    const motsCles = extractKeywords(ai.ocr_text ?? '');
    if (motsCles.length > 0) {
      await db.query(
        `insert into index_ia (document_id, mots_cles, score_pertinence)
         values ($1, $2, $3)
         on conflict (document_id) do update set mots_cles=$2, score_pertinence=$3`,
        [docId, motsCles, ai.confidence ?? 0.5],
      );
    }
  } catch {
    await db.query(`update documents set status='failed', updated_at=now() where id=$1`, [docId]);
  }

  await recordAction({ actorUserId: user.sub, action: 'upload', entityType: 'document', entityId: docId });

  res.status(201).json({ id: docId });
});

// GET /documents/:id — lire document
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

// PUT /documents/:id — modifier document (sequence diagram: Modifier)
documentsRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = updateDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  // Demander données actuelles
  const r = await db.query(`select * from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  const fields: string[] = [];
  const params: any[] = [];

  if (parsed.data.title !== undefined) {
    params.push(parsed.data.title);
    fields.push(`title=$${params.length}`);
  }
  if (parsed.data.description !== undefined) {
    params.push(parsed.data.description);
    fields.push(`description=$${params.length}`);
  }
  if (parsed.data.categoryId !== undefined) {
    params.push(parsed.data.categoryId);
    fields.push(`category_id=$${params.length}`);
  }
  if (parsed.data.tags !== undefined) {
    params.push(parsed.data.tags);
    fields.push(`tags=$${params.length}`);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push(`updated_at=now()`);
  params.push(id);

  // Enregistrer les modifications
  await db.query(
    `update documents set ${fields.join(', ')} where id=$${params.length}`,
    params,
  );

  await recordAction({ actorUserId: user.sub, action: 'update', entityType: 'document', entityId: id });

  // Confirmation de mise à jour — retourner document mis à jour
  const updated = await db.query(
    `select id, title, description, tags, category_id, ai_label, ai_confidence, summary, status, updated_at from documents where id=$1`,
    [id],
  );
  res.json({ document: updated.rows[0] });
});

// POST /documents/:id/summarize — générer et enregistrer résumé (sequence diagram: Résumer)
documentsRouter.post('/:id/summarize', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  // Récupérer le contenu du document
  const r = await db.query(`select * from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  if (!doc.ocr_text) {
    return res.status(422).json({ error: 'Aucun texte extrait disponible pour le résumé' });
  }

  // Récupérer le fichier depuis S3 pour re-analyser
  try {
    const getCmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: doc.storage_key });
    const s3Res = await s3.send(getCmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Res.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Analyser le contenu
    const ai = await analyzeDocument({
      filename: doc.original_filename,
      contentType: doc.content_type,
      bytesBase64: buffer.toString('base64'),
    });

    // Enregistrer le résumé
    await db.query(
      `update documents set summary=$2, ai_label=$3, ai_confidence=$4, updated_at=now() where id=$1`,
      [id, ai.summary ?? null, ai.label ?? null, ai.confidence ?? null],
    );

    await recordAction({ actorUserId: user.sub, action: 'summarize', entityType: 'document', entityId: id });

    res.json({ summary: ai.summary, label: ai.label, confidence: ai.confidence });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la génération du résumé' });
  }
});

// GET /documents/:id/download — télécharger document
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
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: doc.storage_key, ResponseContentDisposition: `attachment; filename="${doc.original_filename}"` }),
    { expiresIn: 60 },
  );

  res.json({ url });
});

// DELETE /documents/:id — supprimer document (sequence diagram: Supprimer)
documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const id = req.params.id;

  const r = await db.query(`select id, owner_user_id, storage_key from documents where id=$1`, [id]);
  const doc = r.rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'admin' && doc.owner_user_id !== user.sub) return res.status(403).json({ error: 'Forbidden' });

  // Supprimer l'enregistrement
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: doc.storage_key }));
  await db.query(`delete from documents where id=$1`, [id]);

  await recordAction({ actorUserId: user.sub, action: 'delete', entityType: 'document', entityId: id });

  // Confirmation de suppression
  res.status(204).send();
});

// Simple keyword extractor for IndexIA
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'à', 'au', 'par', 'sur', 'dans', 'que', 'qui', 'est', 'il', 'elle', 'the', 'a', 'is', 'of', 'in', 'to']);
  const words = text.toLowerCase().match(/\b[a-zàâäéèêëîïôöùûüç]{3,}\b/g) ?? [];
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (!stopWords.has(w)) freq[w] = (freq[w] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
}

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/client.js';

export const searchRouter = Router();

const searchSchema = z.object({
  q: z.string().min(1),
});

// POST /search — recherche intelligente (sequence diagram: Recherche intelligente)
// Analyse la requête, extrait mots-clés, construit requête intelligente, classe par pertinence
searchRouter.post('/', requireAuth, async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Requête invalide', details: parsed.error.flatten() });

  const db = getDb();
  const user = req.user!;
  const { q } = parsed.data;

  // Analyser la requête — extraire mots-clés et comprendre l'intention
  const keywords = analyzeQuery(q);
  const intention = detectIntention(q);

  // Construire la requête intelligente
  const tsQuery = buildSmartQuery(keywords);

  const where: string[] = [];
  const params: any[] = [];

  if (user.role !== 'admin') {
    params.push(user.sub);
    where.push(`d.owner_user_id = $${params.length}`);
  }

  // Recherche intelligente avec score de pertinence
  params.push(tsQuery || q);
  const tsQueryParam = params.length;

  // Effectuer une recherche intelligente avec ranking
  const sql = `
    select
      d.id, d.title, d.description, d.tags, d.category_id,
      d.original_filename, d.content_type, d.size_bytes,
      d.ai_label, d.ai_confidence, d.summary, d.status,
      d.created_at, d.updated_at,
      ts_rank_cd(d.tsv, websearch_to_tsquery('simple', unaccent($${tsQueryParam}))) as pertinence_score,
      coalesce(ia.score_pertinence, 0) as ia_score
    from documents d
    left join index_ia ia on ia.document_id = d.id
    ${where.length ? 'where ' + where.join(' and ') + ` and d.tsv @@ websearch_to_tsquery('simple', unaccent($${tsQueryParam}))` : `where d.tsv @@ websearch_to_tsquery('simple', unaccent($${tsQueryParam}))`}
    order by pertinence_score desc, ia_score desc
    limit 50
  `;

  let results: any[] = [];
  let empty = false;

  try {
    const r = await db.query(sql, params);
    results = r.rows;

    // Classer / filtrer les résultats par pertinence
    if (intention) {
      results = results.filter((doc) => !intention || !doc.ai_label || doc.ai_label === intention || doc.pertinence_score > 0);
    }

    if (results.length === 0) {
      empty = true;
    }
  } catch {
    empty = true;
  }

  // Enregistrer dans historique_recherche
  try {
    await db.query(
      `insert into historique_recherche (user_id, mot_cle) values ($1, $2)`,
      [user.sub, q],
    );

    const rechercheRes = await db.query(
      `insert into recherches (user_id, mot_cle) values ($1, $2) returning id`,
      [user.sub, q],
    );

    if (results.length > 0 && rechercheRes.rows[0]) {
      const rechercheId = rechercheRes.rows[0].id;
      // Enregistrer les résultats
      for (const doc of results.slice(0, 10)) {
        await db.query(
          `insert into resultat_recherche (recherche_id, document_id, score_pertinence) values ($1, $2, $3)`,
          [rechercheId, doc.id, doc.pertinence_score ?? 0],
        ).catch(() => {});
      }
    }
  } catch {
    // historique non bloquant
  }

  if (empty) {
    // Envoyer notification aucun document trouvé
    return res.json({ documents: [], keywords, intention, message: 'Aucun document trouvé' });
  }

  // Présenter résultat final
  res.json({ documents: results, keywords, intention });
});

// GET /search/historique — afficher historique des recherches
searchRouter.get('/historique', requireAuth, async (req, res) => {
  const db = getDb();
  const user = req.user!;

  const r = await db.query(
    `select id, mot_cle, date_recherche from historique_recherche where user_id=$1 order by date_recherche desc limit 50`,
    [user.sub],
  );

  res.json({ historique: r.rows });
});

// Extraire les mots-clés d'une requête utilisateur
function analyzeQuery(q: string): string[] {
  const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'à', 'au', 'par', 'sur', 'dans', 'que', 'qui', 'est', 'il', 'elle', 'the', 'a', 'is', 'of', 'in', 'to', 'avec', 'pour', 'ou', 'mais', 'donc', 'car']);
  return q.toLowerCase()
    .match(/\b[a-zàâäéèêëîïôöùûüç]{2,}\b/g)
    ?.filter((w) => !stopWords.has(w)) ?? [];
}

// Détecter l'intention métier de la requête
function detectIntention(q: string): string | null {
  const lower = q.toLowerCase();
  if (/facture|tva|budget|paiement|virement|devis|audit/.test(lower)) return 'Finance';
  if (/congé|salaire|recrut|contrat|paie|rh|onboarding|formation/.test(lower)) return 'RH';
  if (/réclamation|incident|ticket|assistance|dépannage|sav|support|client/.test(lower)) return 'Support Client';
  return null;
}

// Construire une requête FTS intelligente depuis les mots-clés
function buildSmartQuery(keywords: string[]): string {
  if (keywords.length === 0) return '';
  // Combiner avec OR pour maximiser les résultats, puis classer par pertinence
  return keywords.slice(0, 6).join(' | ');
}

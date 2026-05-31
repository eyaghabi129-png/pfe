import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

type Doc = {
  id: string;
  title: string;
  description?: string | null;
  tags: string[];
  category_id?: string | null;
  ai_label?: string | null;
  ai_confidence?: number | null;
  summary?: string | null;
  status: 'processing' | 'ready' | 'failed' | string;
  size_bytes?: number | null;
  created_at: string;
  updated_at?: string;
  pertinence_score?: number;
};

type Category = { id: string; name: string; description?: string | null };

// Modal de confirmation de suppression (sequence diagram: Supprimer)
function ConfirmDeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%' }}>
        <h3 style={{ marginTop: 0 }}>Confirmer la suppression</h3>
        <p className="muted">Cette action est irréversible. Le document sera supprimé définitivement.</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Annuler</button>
          <button className="btn danger" onClick={onConfirm}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

// Modal d'édition (sequence diagram: Modifier)
function EditModal({ doc, categories, onSave, onCancel }: {
  doc: Doc;
  categories: Category[];
  onSave: (id: string, data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(doc.title);
  const [description, setDescription] = React.useState(doc.description ?? '');
  const [tags, setTags] = React.useState((doc.tags ?? []).join(', '));
  const [categoryId, setCategoryId] = React.useState(doc.category_id ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(doc.id, {
        title,
        description: description || null,
        categoryId: categoryId || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erreur lors de la modification');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ maxWidth: 520, width: '100%' }}>
        <h3 style={{ marginTop: 0 }}>Modifier le document</h3>
        <form onSubmit={handleSave}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input className="input" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Catégorie —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <input className="input" placeholder="Tags (virgules)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <div className="spacer" />
          <textarea className="textarea" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          {error && <div className="badge fail" style={{ marginTop: 8 }}>{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={onCancel}>Annuler</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Confirmer la modification'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const qc = useQueryClient();

  // Upload state
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [uploadCategoryId, setUploadCategoryId] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  // Search state
  const [q, setQ] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [filterCategoryId, setFilterCategoryId] = React.useState('');
  const [useSmartSearch, setUseSmartSearch] = React.useState(false);
  const [smartResults, setSmartResults] = React.useState<Doc[] | null>(null);
  const [smartMeta, setSmartMeta] = React.useState<{ keywords?: string[]; intention?: string | null; message?: string } | null>(null);
  const [searching, setSearching] = React.useState(false);

  // Modals
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [editTarget, setEditTarget] = React.useState<Doc | null>(null);

  // Summarize state
  const [summarizingId, setSummarizingId] = React.useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data.categories as Category[],
  });
  const categories = categoriesQ.data ?? [];

  const docsQ = useQuery({
    queryKey: ['docs', q, tag, filterCategoryId],
    queryFn: async () => {
      const params: any = {};
      if (q) params.q = q;
      if (tag) params.tag = tag;
      if (filterCategoryId) params.categoryId = filterCategoryId;
      return (await api.get('/documents', { params })).data.documents as Doc[];
    },
    enabled: !useSmartSearch,
    refetchInterval: 10_000,
  });

  const docs = useSmartSearch ? (smartResults ?? []) : (docsQ.data ?? []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('title', title || file.name);
      if (description.trim()) form.set('description', description.trim());
      form.set('tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));
      if (uploadCategoryId) form.set('categoryId', uploadCategoryId);
      await api.post('/documents', form, { headers: { 'content-type': 'multipart/form-data' } });
      setFile(null); setTitle(''); setDescription(''); setTags(''); setUploadCategoryId('');
      await qc.invalidateQueries({ queryKey: ['docs'] });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Upload échoué';
      setUploadError(msg === 'Document déjà existant' ? 'Erreur : document déjà existant' : msg);
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    const r = await api.get(`/documents/${id}/download`);
    window.open(r.data.url, '_blank');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await api.delete(`/documents/${deleteTarget}`);
    setDeleteTarget(null);
    await qc.invalidateQueries({ queryKey: ['docs'] });
    if (useSmartSearch && smartResults) {
      setSmartResults(smartResults.filter((d) => d.id !== deleteTarget));
    }
  }

  async function saveEdit(id: string, data: any) {
    await api.put(`/documents/${id}`, data);
    setEditTarget(null);
    await qc.invalidateQueries({ queryKey: ['docs'] });
  }

  async function summarize(id: string) {
    setSummarizingId(id);
    try {
      await api.post(`/documents/${id}/summarize`);
      await qc.invalidateQueries({ queryKey: ['docs'] });
    } catch {
      // silent
    } finally {
      setSummarizingId(null);
    }
  }

  async function runSmartSearch() {
    if (!q.trim()) return;
    setSearching(true);
    setSmartMeta(null);
    try {
      const r = await api.post('/search', { q: q.trim() });
      setSmartResults(r.data.documents);
      setSmartMeta({ keywords: r.data.keywords, intention: r.data.intention, message: r.data.message });
    } catch {
      setSmartResults([]);
    } finally {
      setSearching(false);
    }
  }

  function resetSearch() {
    setQ(''); setTag(''); setFilterCategoryId('');
    setSmartResults(null); setSmartMeta(null); setUseSmartSearch(false);
  }

  const categoryName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {deleteTarget && (
        <ConfirmDeleteModal onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {editTarget && (
        <EditModal doc={editTarget} categories={categories} onSave={saveEdit} onCancel={() => setEditTarget(null)} />
      )}

      <div className="grid">
        {/* Upload — sequence diagram: Ajouter document */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ajouter un document</h3>
          <div className="muted small">Formats: PDF, DOCX, TXT. Vérification doublon + OCR + résumé + classification.</div>
          <div className="spacer" />
          <form onSubmit={upload}>
            <input className="input" type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="spacer" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="input" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select className="input" value={uploadCategoryId} onChange={(e) => setUploadCategoryId(e.target.value)}>
                <option value="">— Catégorie —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="spacer" />
            <input className="input" placeholder="Tags (virgules) ex: facture,urgent" value={tags} onChange={(e) => setTags(e.target.value)} />
            <div className="spacer" />
            <textarea className="textarea" placeholder="Description (optionnelle)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            <div className="spacer" />
            {uploadError && <div className="badge fail" style={{ marginBottom: 10 }}>{uploadError}</div>}
            <button className="btn primary" disabled={uploading || !file} style={{ width: '100%' }}>
              {uploading ? 'Analyse en cours…' : 'Upload + Analyse IA'}
            </button>
          </form>
        </div>

        {/* Recherche — sequence diagram: Recherche intelligente */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recherche</h3>
          <div className="muted small">Recherche full-text ou intelligente avec classement par pertinence.</div>
          <div className="spacer" />
          <input
            className="input"
            placeholder="Saisir requête de recherche…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && useSmartSearch) runSmartSearch(); }}
          />
          <div className="spacer" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={useSmartSearch} onChange={(e) => { setUseSmartSearch(e.target.checked); setSmartResults(null); setSmartMeta(null); }} />
            Recherche intelligente (IA) — analyse mots-clés + intention
          </label>
          <div className="spacer" />
          {!useSmartSearch && (
            <>
              <input className="input" placeholder="Filtrer par tag (exact)" value={tag} onChange={(e) => setTag(e.target.value)} />
              <div className="spacer" />
              <select className="input" value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}>
                <option value="">— Toutes catégories —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="spacer" />
            </>
          )}
          {useSmartSearch && (
            <>
              <button className="btn primary" style={{ width: '100%' }} onClick={runSmartSearch} disabled={searching || !q.trim()}>
                {searching ? 'Analyse en cours…' : 'Lancer la recherche intelligente'}
              </button>
              <div className="spacer" />
            </>
          )}
          {smartMeta && (
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              {smartMeta.keywords?.length ? <div className="muted">Mots-clés extraits: {smartMeta.keywords.join(', ')}</div> : null}
              {smartMeta.intention ? <div className="badge ok" style={{ marginTop: 4 }}>Intention détectée: {smartMeta.intention}</div> : null}
              {smartMeta.message ? <div className="badge warn" style={{ marginTop: 4 }}>{smartMeta.message}</div> : null}
            </div>
          )}
          <div className="row">
            <span className="badge">Résultats: {docsQ.isLoading || searching ? '…' : docs.length}</span>
            {!useSmartSearch && <span className="badge">Auto-refresh: 10s</span>}
            <button className="btn" onClick={resetSearch}>Reset</button>
          </div>
        </div>
      </div>

      {/* Liste documents */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '36%' }}>Document</th>
              <th style={{ width: '12%' }}>Catégorie</th>
              <th style={{ width: '16%' }}>IA</th>
              <th style={{ width: '10%' }}>Status</th>
              <th style={{ width: '12%' }}>Créé</th>
              <th style={{ width: '14%' }}></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <div style={{ fontWeight: 850 }}>{d.title}</div>
                  <div className="muted small">{d.summary ? d.summary : d.description || ''}</div>
                  <div className="row" style={{ marginTop: 6 }}>
                    {(d.tags ?? []).slice(0, 5).map((t) => (
                      <span key={t} className="badge">{t}</span>
                    ))}
                  </div>
                  {d.pertinence_score != null && (
                    <div className="muted small" style={{ marginTop: 4 }}>pertinence: {d.pertinence_score.toFixed(4)}</div>
                  )}
                </td>
                <td>
                  <div className="muted small">{categoryName(d.category_id)}</div>
                </td>
                <td>
                  <div className="badge ok">{d.ai_label ?? '—'}</div>
                  <div className="muted small">{d.ai_confidence ? `conf: ${d.ai_confidence.toFixed(2)}` : ''}</div>
                  {!d.summary && d.status === 'ready' && (
                    <button
                      className="btn"
                      style={{ marginTop: 4, fontSize: 11, padding: '2px 8px' }}
                      disabled={summarizingId === d.id}
                      onClick={() => summarize(d.id)}
                    >
                      {summarizingId === d.id ? '…' : 'Résumer'}
                    </button>
                  )}
                </td>
                <td>
                  <span className={'badge ' + (d.status === 'ready' ? 'ok' : d.status === 'failed' ? 'fail' : d.status === 'processing' ? 'warn' : '')}>
                    {d.status}
                  </span>
                </td>
                <td>
                  <div className="muted small">{new Date(d.created_at).toLocaleString()}</div>
                </td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 4 }}>
                    <button className="btn" onClick={() => download(d.id)}>↓</button>
                    <button className="btn" onClick={() => setEditTarget(d)}>Modifier</button>
                    <button className="btn danger" onClick={() => setDeleteTarget(d.id)}>Supprimer</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && !docsQ.isLoading && !searching ? (
          <div className="muted" style={{ padding: 12 }}>Aucun document.</div>
        ) : null}
      </div>
    </div>
  );
}

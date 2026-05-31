import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

type Category = { id: string; name: string; description?: string | null };

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const catsQ = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data.categories as Category[],
  });
  const categories = catsQ.data ?? [];

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Ajouter catégorie
      await api.post('/categories', { name: name.trim(), description: description.trim() || null });
      setName(''); setDescription('');
      await qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erreur');
    }
  }

  async function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description ?? '');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setError(null);
    try {
      // Modifier catégorie
      await api.put(`/categories/${editId}`, { name: editName.trim(), description: editDescription.trim() || null });
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erreur');
    }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await api.delete(`/categories/${id}`);
      await qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erreur');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ajouter une catégorie</h3>
          <form onSubmit={addCategory}>
            <input className="input" placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} required />
            <div className="spacer" />
            <textarea className="textarea" placeholder="Description (optionnelle)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            {error && <div className="badge fail" style={{ marginTop: 8 }}>{error}</div>}
            <div className="spacer" />
            <button className="btn primary" style={{ width: '100%' }} disabled={!name.trim()}>Ajouter</button>
          </form>
        </div>

        {editId && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Modifier la catégorie</h3>
            <form onSubmit={saveEdit}>
              <input className="input" placeholder="Nom" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              <div className="spacer" />
              <textarea className="textarea" placeholder="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => setEditId(null)}>Annuler</button>
                <button type="submit" className="btn primary">Enregistrer</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Catégories ({categories.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Description</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 700 }}>{c.name}</td>
                <td className="muted small">{c.description ?? '—'}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <button className="btn" onClick={() => startEdit(c)}>Modifier</button>
                    <button className="btn danger" onClick={() => deleteCategory(c.id)}>Supprimer</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && !catsQ.isLoading && (
          <div className="muted" style={{ padding: 12 }}>Aucune catégorie.</div>
        )}
      </div>
    </div>
  );
}

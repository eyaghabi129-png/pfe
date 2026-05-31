import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

type User = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'user';
  created_at: string;
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<User | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);

  // Form states
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'manager' | 'user'>('user');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Diagram 3: getAllEmployes()
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.users as User[],
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (editing) {
        // Diagram 3: modifierEmploye(data)
        await api.put(`/users/${editing.id}`, { full_name: fullName, role });
      } else {
        // Diagram 3: ajouterEmploye(data)
        await api.post('/users', { email, full_name: fullName, role, password });
      }
      
      await qc.invalidateQueries({ queryKey: ['users'] });
      reset();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    // Diagram 3: desactiverEmploye(id)
    if (!confirm('Êtes-vous sûr de vouloir supprimer/désactiver cet employé ?')) return;
    try {
      await api.delete(`/users/${id}`);
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Delete failed');
    }
  }

  function reset() {
    setEditing(null);
    setShowAdd(false);
    setEmail('');
    setFullName('');
    setRole('user');
    setPassword('');
    setError(null);
  }

  function startEdit(u: User) {
    setEditing(u);
    setShowAdd(true);
    setEmail(u.email);
    setFullName(u.full_name);
    setRole(u.role);
    setPassword('');
  }

  const users = usersQ.data ?? [];

  return (
    <div className="animate-fade">
      <div className="topbar" style={{ marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Gestion des Employés</h2>
          <div className="muted small">Ajouter, modifier ou désactiver les accès des collaborateurs Tunisie Telecom.</div>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          + Ajouter un employé
        </button>
      </div>

      {showAdd && (
        <div className="card animate-fade" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0 }}>{editing ? 'Modifier' : 'Ajouter'} un employé</h3>
          <form onSubmit={save} className="grid">
            <div>
              <label className="muted small">EMAIL</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!editing} placeholder="nom@tunisietelecom.tn" />
            </div>
            <div>
              <label className="muted small">NOM COMPLET</label>
              <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jean Dupont" />
            </div>
            <div>
              <label className="muted small">RÔLE</label>
              <select className="select" value={role} onChange={e => setRole(e.target.value as any)}>
                <option value="user">Utilisateur (Lecture)</option>
                <option value="manager">Manager (Upload)</option>
                <option value="admin">Administrateur (Tout)</option>
              </select>
            </div>
            {!editing && (
              <div>
                <label className="muted small">MOT DE PASSE</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="button" className="btn" onClick={reset}>Annuler</button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer le compte'}
              </button>
            </div>
          </form>
          {error && <div className="badge fail" style={{ marginTop: '10px' }}>{error}</div>}
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Collaborateur</th>
                <th>Rôle</th>
                <th>Date d'ajout</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'fail' : u.role === 'manager' ? 'warn' : 'ok'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="muted small">{new Date(u.created_at).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => startEdit(u)}>Modifier</button>
                      <button className="btn danger" onClick={() => remove(u.id)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !usersQ.isLoading && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '40px' }}>
                    Aucun employé trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

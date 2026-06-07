import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

type User = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'user';
  is_active: boolean;
  created_at: string;
};

type Me = { id: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  user: 'Utilisateur',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'fail',
  manager: 'warn',
  user: 'ok',
};

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(0,160,223,.35), rgba(34,197,94,.25))',
        border: '1px solid rgba(0,160,223,.30)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0,
        color: 'var(--tt-blue)',
      }}
    >
      {initials || '?'}
    </div>
  );
}

export default function EmployeesPage() {
  const qc = useQueryClient();

  const meQ = useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/users/me')).data.user,
  });

  const usersQ = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.users,
    enabled: meQ.data?.role === 'admin',
  });

  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'manager' | 'user'>('user');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [searchQ, setSearchQ] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');

  const isAdmin = meQ.data?.role === 'admin';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (editing) {
        const body: Record<string, unknown> = { full_name: fullName, role };
        if (newPassword) body.password = newPassword;
        await api.put(`/users/${editing.id}`, body);
        setSuccess('Employé mis à jour avec succès.');
      } else {
        await api.post('/users', { email, full_name: fullName, role, password });
        setSuccess('Compte créé avec succès.');
      }
      await qc.invalidateQueries({ queryKey: ['users'] });
      reset();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Opération échouée');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(u: User) {
    const action = u.is_active ? 'désactiver' : 'réactiver';
    if (!confirm(`Êtes-vous sûr de vouloir ${action} ${u.full_name} ?`)) return;
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Opération échouée');
    }
  }

  async function remove(u: User) {
    if (!confirm(`Supprimer définitivement ${u.full_name} ? Cette action est irréversible.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Suppression échouée');
    }
  }

  function reset() {
    setEditing(null);
    setShowForm(false);
    setEmail('');
    setFullName('');
    setRole('user');
    setPassword('');
    setNewPassword('');
    setError(null);
  }

  function startEdit(u: User) {
    setEditing(u);
    setShowForm(true);
    setEmail(u.email);
    setFullName(u.full_name);
    setRole(u.role);
    setPassword('');
    setNewPassword('');
    setError(null);
    setSuccess(null);
  }

  const allUsers = usersQ.data ?? [];
  const filtered = allUsers.filter((u) => {
    const q = searchQ.toLowerCase();
    const matchSearch =
      !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: allUsers.length,
    active: allUsers.filter((u) => u.is_active).length,
    admins: allUsers.filter((u) => u.role === 'admin').length,
    managers: allUsers.filter((u) => u.role === 'manager').length,
  };

  if (meQ.isLoading) {
    return (
      <div className="animate-fade" style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>
        Chargement...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="animate-fade">
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Accès restreint</div>
          <div className="muted small">Seuls les administrateurs peuvent gérer les employés.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade">
      {/* Header */}
      <div className="topbar" style={{ marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Gestion des Employés</h2>
          <div className="muted small">
            Gérer les accès et les rôles des collaborateurs Tunisie Telecom.
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => { reset(); setShowForm(true); }}
        >
          + Ajouter un employé
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid3" style={{ marginBottom: '20px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '14px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tt-blue)' }}>{stats.total}</div>
          <div className="muted small">Total</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '14px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tt-green)' }}>{stats.active}</div>
          <div className="muted small">Actifs</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '14px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tt-orange)' }}>
            {stats.total - stats.active}
          </div>
          <div className="muted small">Inactifs</div>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div
          className="badge ok animate-fade"
          style={{ marginBottom: 16, padding: '10px 14px', display: 'block', borderRadius: 12 }}
        >
          {success}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="card animate-fade" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>
            {editing ? `Modifier — ${editing.full_name}` : 'Ajouter un employé'}
          </h3>
          <form onSubmit={save}>
            <div className="grid" style={{ marginBottom: 16 }}>
              <div>
                <label className="muted small">EMAIL</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!editing}
                  placeholder="nom@tunisietelecom.tn"
                  required
                />
              </div>
              <div>
                <label className="muted small">NOM COMPLET</label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Prénom Nom"
                  required
                  minLength={2}
                />
              </div>
              <div>
                <label className="muted small">RÔLE</label>
                <select
                  className="select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                >
                  <option value="user">Utilisateur (Lecture seule)</option>
                  <option value="manager">Manager (Upload + édition)</option>
                  <option value="admin">Administrateur (Accès total)</option>
                </select>
              </div>
              <div>
                <label className="muted small">
                  {editing ? 'NOUVEAU MOT DE PASSE (optionnel)' : 'MOT DE PASSE'}
                </label>
                <input
                  className="input"
                  type="password"
                  value={editing ? newPassword : password}
                  onChange={(e) =>
                    editing ? setNewPassword(e.target.value) : setPassword(e.target.value)
                  }
                  placeholder={editing ? 'Laisser vide pour ne pas changer' : '••••••••'}
                  required={!editing}
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="badge fail" style={{ marginBottom: 12, display: 'block', borderRadius: 10, padding: '8px 12px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={reset}>
                Annuler
              </button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Rechercher par nom ou email…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ width: 180 }}
        >
          <option value="all">Tous les rôles</option>
          <option value="admin">Administrateur</option>
          <option value="manager">Manager</option>
          <option value="user">Utilisateur</option>
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {usersQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            Chargement des employés…
          </div>
        ) : usersQ.isError ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tt-magenta)' }}>
            Erreur lors du chargement des employés.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Date d'ajout</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.full_name} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                          <div className="muted small">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'ok' : 'fail'}`}>
                        {u.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td>
                      <div className="muted small">
                        {new Date(u.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn" onClick={() => startEdit(u)}>
                          Modifier
                        </button>
                        <button
                          className={`btn ${u.is_active ? '' : 'primary'}`}
                          onClick={() => toggleActive(u)}
                          title={u.is_active ? 'Désactiver le compte' : 'Réactiver le compte'}
                        >
                          {u.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                        <button className="btn danger" onClick={() => remove(u)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="muted"
                      style={{ textAlign: 'center', padding: '40px' }}
                    >
                      {searchQ || roleFilter !== 'all'
                        ? 'Aucun résultat pour cette recherche.'
                        : 'Aucun employé trouvé.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { api } from '../../api';

export default function LoginPage({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = React.useState('admin@tt.local');
  const [password, setPassword] = React.useState('password123');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      onLogin(r.data.token);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authSplit">
      <div className="authHero">
        <div className="brand">
          <img src="/logo.jpg" alt="Tunisie Telecom" />
          <div>
            <strong>DMS AI</strong>
            <div className="muted small">Plateforme intelligente de gestion documentaire</div>
          </div>
        </div>

        <div className="authRibbon" />

        <h2 className="authHeroTitle">Connexion sécurisée</h2>
        <div className="muted">
          Recherche avancée, OCR, classification automatique (Finance / RH / Support Client), résumé et recommandations.
        </div>

        <div className="spacer" />
        <div className="card" style={{ background: 'rgba(255,255,255,.03)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Comptes de démo</div>
          <div className="muted small">admin@tt.local / password123</div>
          <div className="muted small">manager@tt.local / password123</div>
          <div className="muted small">user@tt.local / password123</div>
        </div>
      </div>

      <div className="card" style={{ alignSelf: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Se connecter</h2>
        <div className="muted">Accès par rôle (admin / manager / user)</div>
        <div className="spacer" />

        <form onSubmit={submit}>
          <label>
            <div className="muted">Email</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.tn"
              autoComplete="username"
            />
          </label>
          <div className="spacer" />
          <label>
            <div className="muted">Mot de passe</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          <div className="spacer" />

          {error ? (
            <div className="badge fail" style={{ marginBottom: 10 }}>
              {error}
            </div>
          ) : null}

          <button className="btn primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Connexion…' : 'Connexion'}
          </button>
        </form>
      </div>
    </div>
  );
}

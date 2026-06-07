import React from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { api, setAuthToken } from '../api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import CategoriesPage from './pages/CategoriesPage';
import EmployeesPage from './pages/EmployeesPage';

function useStoredToken() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem('token'));
  React.useEffect(() => setAuthToken(token), [token]);
  return {
    token,
    setToken: (t: string | null) => {
      if (t) localStorage.setItem('token', t);
      else localStorage.removeItem('token');
      setToken(t);
    },
  };
}

function Sidebar({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo.jpg" alt="logo" />
        <div>
          <strong>DMS AI</strong>
          <div className="muted small">Tunisie Telecom theme</div>
        </div>
      </div>

      <div className="navSection">
        <NavLink className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`} to="/dashboard">
          Dashboard
        </NavLink>
        <NavLink className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`} to="/documents">
          Documents
        </NavLink>
        <NavLink className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`} to="/categories">
          Catégories
        </NavLink>
        <NavLink className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`} to="/employees">
          Employés
        </NavLink>
      </div>

      <div className="spacer" />

      {token ? (
        <button className="btn danger" onClick={onLogout} style={{ width: '100%' }}>
          Logout
        </button>
      ) : null}

      <div className="spacer" />
      <div className="muted small">
        Astuce: uploader un PDF scanné pour tester OCR + classification.
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <div className="topbar">
      <div>
        <div style={{ fontWeight: 800, letterSpacing: '-.01em' }}>Document Intelligence</div>
        <div className="muted small">Recherche, OCR, classification, résumé, insights</div>
      </div>
      <div className="row">
        <span className="badge">v0.1</span>
      </div>
    </div>
  );
}

export default function App() {
  const nav = useNavigate();
  const { token, setToken } = useStoredToken();

  async function logout() {
    setToken(null);
    nav('/login');
  }

  React.useEffect(() => {
    if (!token) return;
    api.get('/health').catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className="container">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={(t) => (setToken(t), nav('/dashboard'))} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="shell">
        <Sidebar token={token} onLogout={logout} />
        <div className="content">
          <Topbar />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

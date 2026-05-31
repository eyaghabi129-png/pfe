import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';

type Doc = {
  id: string;
  ai_label?: string | null;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  size_bytes?: number;
};

const COLORS = ['#00A0DF', '#22C55E', '#FACC15', '#F59E0B', '#E11D48', '#7C3AED'];

function toDayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/users/me')).data.user,
  });

  const docsQ = useQuery({
    queryKey: ['docs'],
    queryFn: async () => (await api.get('/documents')).data.documents as Doc[],
    refetchInterval: 10_000,
  });

  const docs = docsQ.data ?? [];

  const total = docs.length;
  const ready = docs.filter((d) => d.status === 'ready').length;
  const failed = docs.filter((d) => d.status === 'failed').length;
  const processing = docs.filter((d) => d.status === 'processing').length;

  const byLabel = docs.reduce<Record<string, number>>((acc, d) => {
    const k = d.ai_label || 'Non classé';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(byLabel)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const statusData = [
    { name: 'ready', value: ready },
    { name: 'processing', value: processing },
    { name: 'failed', value: failed },
  ];

  // last 14 days uploads
  const now = new Date();
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(toDayKey(d));
  }
  const byDay = docs.reduce<Record<string, number>>((acc, d) => {
    const key = (d.created_at || '').slice(0, 10);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const lineData = days.map((day) => ({ day: day.slice(5), uploads: byDay[day] ?? 0 }));

  const totalBytes = docs.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);
  const totalMB = totalBytes / (1024 * 1024);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid3">
        <div className="card">
          <div className="muted">Utilisateur</div>
          <div style={{ fontSize: 18, fontWeight: 850, marginTop: 6 }}>
            {meQ.data ? meQ.data.full_name : meQ.isLoading ? '…' : '—'}
          </div>
          <div className="muted small">{meQ.data?.email}</div>
          {meQ.data?.role ? (
            <div className="spacer">
              <div className="badge ok">role: {meQ.data.role}</div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="muted">Documents visibles</div>
          <div className="kpi">
            <div className="value">{docsQ.isLoading ? '…' : total}</div>
          </div>
          <div className="muted small">Volume total: {totalMB.toFixed(2)} MB</div>
        </div>

        <div className="card">
          <div className="muted">État du pipeline</div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge ok">ready: {ready}</span>
            <span className="badge warn">processing: {processing}</span>
            <span className="badge fail">failed: {failed}</span>
          </div>
          <div className="spacer" />
          <div className="muted small">Auto-refresh: 10s</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Répartition par classification (IA)</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={2}>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="muted small">Basé sur `ai_label` calculé au moment de l’upload.</div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Uploads (14 derniers jours)</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={lineData}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,.55)" />
                <YAxis stroke="rgba(255,255,255,.55)" allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="uploads" stroke="#00A0DF" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Status distribution</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={statusData}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,.55)" />
              <YAxis stroke="rgba(255,255,255,.55)" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#22C55E" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="muted small">Si tu veux: on peut ajouter des graphes par tags / catégories DB et des alertes SLA.</div>
      </div>
    </div>
  );
}

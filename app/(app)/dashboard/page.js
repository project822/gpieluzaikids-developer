'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import {
  Card,
  StatCard,
  Spinner,
  EmptyState,
  usePolling,
  formatUptime,
  formatDateTime,
} from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';

export default function DashboardPage() {
  const { data, error, loading, refresh } = usePolling(async () => {
    const res = await authedFetch('/api/dev/status');
    if (!res.ok) throw new Error(res.status === 502 ? 'Website utama tidak dapat dijangkau.' : 'Gagal memuat status.');
    return safeJson(res);
  }, 5000);

  // Status koneksi MongoDB milik dashboard ini (database eluzai-dashboard).
  // PENTING: /api/db/health mengembalikan HTTP 503 (gagal koneksi) / 500
  // (belum dikonfigurasi) dengan body JSON berisi status asli — jadi body
  // tetap dipakai apa pun statusnya; hanya kegagalan jaringan (fetch reject)
  // yang membuat data null (kartu tampil "—").
  const { data: dbHealth } = usePolling(async () => {
    const res = await authedFetch('/api/db/health', { cache: 'no-store' });
    return safeJson(res);
  }, 5000);

  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState(null);

  async function toggleMaintenance() {
    if (!data) return;
    setToggling(true);
    setMsg(null);
    const next = !data.maintenance.enabled;
    try {
      const res = await csrfFetch('/api/dev/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance: next }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal mengubah maintenance mode.');
      setMsg({ type: 'success', text: `Maintenance mode ${next ? 'DIAKTIFKAN' : 'dinonaktifkan'}.` });
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setToggling(false);
    }
  }

  async function unblock(ip) {
    try {
      const res = await csrfFetch(`/api/dev/ip-ratelimit?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal membuka blokir.');
      setMsg({ type: 'success', text: `Blokir untuk ${ip} dibuka.` });
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  if (loading && !data) {
    return <Spinner label="Menghubungkan ke website utama..." />;
  }

  if (error && !data) {
    return (
      <Card title="Website Utama Offline" icon="alert">
        <div className="alert-dev alert-dev-danger d-flex align-items-center gap-3 mb-3">
          <Icon name="ban" size={22} />
          <div>
            <div className="fw-semibold">Tidak dapat menghubungi website utama.</div>
            <div style={{ fontSize: '0.85rem' }}>
              Pastikan website utama online dan dapat diakses{SITE_URL ? ` di ${SITE_URL}` : ''}, lalu muat ulang halaman ini.
            </div>
          </div>
        </div>
        <button className="btn-dev btn-dev-outline" onClick={refresh}>
          <Icon name="refresh" size={16} />
          Muat Ulang
        </button>
      </Card>
    );
  }

  const { app, db, maintenance, rateLimitedIps } = data || {};
  const siteOnline = Boolean(app);
  const rateCount = (rateLimitedIps || []).length;

  // Status MongoDB dashboard: null = belum ada data (memuat), selain itu
  // mengikuti respons /api/db/health.
  const mongoConfigured = dbHealth ? Boolean(dbHealth.configured) : null;
  const mongoConnected = Boolean(dbHealth?.connected);
  const mongoValue = !dbHealth
    ? '—'
    : mongoConnected
      ? 'Active'
      : mongoConfigured
        ? 'Disconnected'
        : 'Belum Diset';
  const mongoTint = !dbHealth
    ? 'gray'
    : mongoConnected
      ? 'green'
      : mongoConfigured
        ? 'red'
        : 'amber';

  return (
    <div className="d-flex flex-column gap-3 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      {/* Kartu status utama — nilai status saja, tanpa deskripsi */}
      <div className="row g-3">
        <div className="col-6 col-xl">
          <StatCard
            icon="server"
            tint={siteOnline ? 'green' : 'red'}
            value={siteOnline ? 'Active' : 'Disconnected'}
            label="Website Utama"
          />
        </div>
        <div className="col-6 col-xl">
          <StatCard
            icon="database"
            tint={db?.connected ? 'green' : 'red'}
            value={db?.connected ? 'Active' : 'Disconnected'}
            label="Database Situs"
          />
        </div>
        <div className="col-6 col-xl">
          <StatCard
            icon="hardDrive"
            tint={mongoTint}
            value={mongoValue}
            label={`MongoDB Dashboard${mongoConnected && dbHealth?.latencyMs != null ? ` · ${dbHealth.latencyMs} ms` : ''}`}
          />
        </div>
        <div className="col-6 col-xl">
          <StatCard
            icon="wrench"
            tint={maintenance?.enabled ? 'amber' : 'green'}
            value={maintenance?.enabled ? 'Active' : 'Inactive'}
            label="Maintenance"
          />
        </div>
        <div className="col-6 col-xl">
          <StatCard
            icon="ban"
            tint={rateCount > 0 ? 'red' : 'green'}
            value={rateCount}
            label="IP Terblokir"
          />
        </div>
      </div>

      <div className="row g-3">
        {/* Maintenance mode — kompak */}
        <div className="col-lg-5">
          <Card
            title="Maintenance Mode"
            className="h-100"
            icon="wrench"
            actions={
              <label className="dev-switch">
                <input
                  type="checkbox"
                  checked={Boolean(maintenance?.enabled)}
                  onChange={toggleMaintenance}
                  disabled={toggling || !siteOnline}
                />
                <span className="track" />
              </label>
            }
          >
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <span className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                {maintenance?.enabled ? 'Situs dalam pemeliharaan' : 'Situs berjalan normal'}
              </span>
            </div>
            <button
              className="btn-dev w-100 justify-content-center"
              onClick={toggleMaintenance}
              disabled={toggling || !siteOnline}
              style={maintenance?.enabled ? { background: 'var(--dev-red-soft)', color: 'var(--dev-red)', fontWeight: 600 } : {}}
            >
              {toggling ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  Menyimpan...
                </>
              ) : maintenance?.enabled ? (
                <>
                  <Icon name="check" size={16} />
                  Nonaktifkan Maintenance
                </>
              ) : (
                <>
                  <Icon name="alert" size={16} />
                  Aktifkan Maintenance Mode
                </>
              )}
            </button>
          </Card>
        </div>

        {/* IP terblokir real-time */}
        <div className="col-lg-7">
          <Card
            title="IP Terblokir (Rate Limit)"
            className="h-100"
            icon="activity"
            actions={
              <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refresh} title="Segarkan">
                <Icon name="refresh" size={15} />
                Segarkan
              </button>
            }
          >
            {rateCount === 0 ? (
              <EmptyState icon="checkCircle" title="Tidak ada IP yang terblokir" />
            ) : (
              <div className="table-responsive">
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Percobaan</th>
                      <th>Dimensi</th>
                      <th>Sisa Blokir</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rateLimitedIps || []).map((r) => (
                      <tr key={r.ip}>
                        <td>
                          <span className="mono">{r.ip}</span>
                        </td>
                        <td>{r.count}</td>
                        <td>
                          <span className="pill pill-gray">{r.dimensions.join(' + ')}</span>
                        </td>
                        <td>
                          <span className="pill pill-red">{Math.ceil(r.retryAfter / 60)} mnt</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="action-btn" title="Buka blokir" onClick={() => unblock(r.ip)}>
                            <Icon name="check" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Info sistem */}
      <div className="row g-3">
        <div className="col-lg-6">
          <Card title="Konteks Sistem" className="h-100" icon="cpu">
            <div className="d-flex flex-column gap-2" style={{ fontSize: '0.84rem' }}>
              <div className="d-flex justify-content-between"><span className="text-muted-dev">Waktu server</span><span className="mono">{formatDateTime(app?.now)}</span></div>
              <div className="d-flex justify-content-between"><span className="text-muted-dev">Environment</span><span className="mono">{app?.nodeEnv}</span></div>
              <div className="d-flex justify-content-between"><span className="text-muted-dev">Uptime proses</span><span>{formatUptime(app?.uptimeSeconds)}</span></div>
              <div className="d-flex justify-content-between"><span className="text-muted-dev">Aplikasi</span><span>{app?.name}</span></div>
            </div>
          </Card>
        </div>
        <div className="col-lg-6">
          <Card title="Ringkasan Keamanan" className="h-100" icon="shield">
            <div className="row g-2">
              {[
                ['events24h', 'Event 24 jam'],
                ['failedLogin', 'Login gagal'],
                ['rateLimited', 'Rate limit'],
                ['csrf', 'CSRF ditolak'],
                ['blocked', 'Blocked IP'],
              ].map(([key, label]) => (
                <div className="col-6" key={key}>
                  <div className="rounded-3 p-3" style={{ background: 'var(--dev-surface-2)', border: '1px solid var(--dev-border)' }}>
                    <div className="fw-bold" style={{ fontSize: '1.05rem' }}>{data?.security?.[key] ?? 0}</div>
                    <div className="text-muted-dev" style={{ fontSize: '0.7rem' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

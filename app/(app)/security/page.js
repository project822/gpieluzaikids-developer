'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import {
  Card,
  Spinner,
  StatusPill,
  EmptyState,
  usePolling,
} from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

// Status keamanan — dua keadaan saja (to the point).
const ACTIVE = new Set(['enabled', 'active', 'partial', 'dev']);

export default function SecurityPage() {
  const { data: sec, loading: secLoading, refresh: refreshSec } = usePolling(async () => {
    const res = await authedFetch('/api/dev/security');
    if (!res.ok) throw new Error('Gagal memuat lapisan keamanan.');
    return safeJson(res);
  }, 8000);

  const { data: status, refresh: refreshStatus } = usePolling(async () => {
    const res = await authedFetch('/api/dev/status');
    if (!res.ok) throw new Error('Gagal memuat status.');
    return safeJson(res);
  }, 6000);

  const [msg, setMsg] = useState(null);
  const [newBlockedIp, setNewBlockedIp] = useState('');
  const [busy, setBusy] = useState(false);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  async function unblockRateLimit(ip) {
    try {
      const res = await csrfFetch(`/api/dev/ip-ratelimit?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal membuka blokir.');
      flash('success', `Rate limit untuk ${ip} dibuka.`);
      refreshStatus();
      refreshSec();
    } catch (e) {
      flash('error', e.message);
    }
  }

  async function removeBlocked(ip) {
    try {
      const res = await csrfFetch(`/api/dev/system/blocked?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus IP.');
      flash('success', `${ip} dihapus dari blocklist.`);
      refreshStatus();
      refreshSec();
    } catch (e) {
      flash('error', e.message);
    }
  }

  async function addBlocked(e) {
    e.preventDefault();
    const ip = newBlockedIp.trim();
    if (!ip) return;
    setBusy(true);
    try {
      const existing = status?.blockedIps || [];
      const res = await csrfFetch('/api/dev/system/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: [...existing, ip] }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menambah IP.');
      flash('success', `${ip} ditambahkan ke blocklist.`);
      setNewBlockedIp('');
      refreshStatus();
      refreshSec();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  }

  const layers = sec?.layers || [];
  const rateLimited = status?.rateLimitedIps || [];
  const blockedIps =
    status?.blockedIpsDetail?.length > 0
      ? status.blockedIpsDetail
      : (status?.blockedIps || []).map((ip) => ({ ip, source: 'runtime' }));

  return (
    <div className="d-flex flex-column gap-3 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      {/* Lapisan keamanan — nama + status saja */}
      <Card
        title="Lapisan Keamanan"
        icon="shield"
        actions={
          <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refreshSec} title="Segarkan">
            <Icon name="refresh" size={15} />
            Segarkan
          </button>
        }
      >
        {secLoading && !sec ? (
          <Spinner label="Memuat lapisan keamanan..." />
        ) : layers.length === 0 ? (
          <EmptyState icon="shield" title="Tidak ada data keamanan" />
        ) : (
          <div className="row g-3">
            {layers.map((layer) => {
              const active = ACTIVE.has(layer.status);
              return (
                <div className="col-sm-6 col-xl-4" key={layer.id}>
                  <div className="sec-card">
                    <div className="sec-card-head">
                      <span className="sec-card-name">{layer.name}</span>
                      <StatusPill tone={active ? 'green' : 'red'}>{active ? 'Active' : 'Disconnected'}</StatusPill>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="row g-3">
        {/* IP rate limit real-time */}
        <div className="col-lg-7">
          <Card
            title="IP Terblokir (Rate Limit)"
            icon="activity"
            actions={
              <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refreshStatus} title="Segarkan">
                <Icon name="refresh" size={15} />
                Segarkan
              </button>
            }
          >
            {rateLimited.length === 0 ? (
              <EmptyState icon="checkCircle" title="Tidak ada blokir rate limit" />
            ) : (
              <div className="table-responsive">
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Percobaan</th>
                      <th>Sisa Blokir</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateLimited.map((r) => (
                      <tr key={r.ip}>
                        <td><span className="mono">{r.ip}</span></td>
                        <td>{r.count}</td>
                        <td><span className="pill pill-red">{Math.ceil(r.retryAfter / 60)} mnt</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="action-btn" title="Buka blokir" onClick={() => unblockRateLimit(r.ip)}>
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

        {/* Blocklist manual */}
        <div className="col-lg-5">
          <Card title="Blocklist Manual" icon="ban">
            <form onSubmit={addBlocked} className="d-flex gap-2 mb-3">
              <input
                className="dev-input"
                placeholder="mis. 203.0.113.7"
                value={newBlockedIp}
                onChange={(e) => setNewBlockedIp(e.target.value)}
                pattern="[\d.a-fA-F:]+"
                title="Format IP valid"
                required
              />
              <button className="btn-dev btn-dev-primary btn-sm-dev flex-none" disabled={busy} type="submit">
                <Icon name="plus" size={15} />
                Blokir
              </button>
            </form>

            {blockedIps.length === 0 ? (
              <EmptyState icon="shield" title="Blocklist kosong" />
            ) : (
              <div className="d-flex flex-column gap-2">
                {blockedIps.map(({ ip, source }) => (
                  <div
                    key={ip}
                    className="d-flex align-items-center justify-content-between gap-2 px-3 py-2"
                    style={{ background: 'var(--dev-surface-2)', border: '1px solid var(--dev-border)', borderRadius: 9 }}
                  >
                    <div className="d-flex align-items-center gap-2 min-w-0">
                      <span className="mono">{ip}</span>
                      {source === 'env' && (
                        <span className="pill pill-gray" title="Didefinisikan di env BLOCKED_IPS website utama — hapus lewat .env.local">
                          env
                        </span>
                      )}
                    </div>
                    {source !== 'env' ? (
                      <button className="action-btn danger" title="Hapus dari blocklist" onClick={() => removeBlocked(ip)}>
                        <Icon name="trash" size={15} />
                      </button>
                    ) : (
                      <span className="text-muted-dev" style={{ fontSize: '0.7rem' }}>via .env</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

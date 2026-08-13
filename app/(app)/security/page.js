'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import {
  Card,
  Spinner,
  StatusPill,
  EmptyState,
  usePolling,
} from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson, getDeviceId } from '@/lib/csrfClient';

// Status keamanan — dua keadaan saja (to the point).
const ACTIVE = new Set(['enabled', 'active', 'partial', 'dev']);

// Tampilkan ID perangkat pendek (awal + akhir) — ID penuh via tooltip/copy.
function shortDevice(id, len = 6) {
  const s = String(id || '');
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}…${s.slice(-len)}`;
}

export default function SecurityPage() {
  // Polling cepat (real-time) — 2 endpoint kecil; setelah aksi apa pun
  // langsung di-refresh manual agar perubahan tampil seketika.
  const { data: sec, loading: secLoading, refresh: refreshSec } = usePolling(async () => {
    const res = await authedFetch('/api/dev/security');
    if (!res.ok) throw new Error('Gagal memuat lapisan keamanan.');
    return safeJson(res);
  }, 5000);

  const { data: status, refresh: refreshStatus } = usePolling(async () => {
    const res = await authedFetch('/api/dev/status');
    if (!res.ok) throw new Error('Gagal memuat status.');
    return safeJson(res);
  }, 5000); // 5s — masih real-time; polling berhenti saat tab tidak aktif

  const [msg, setMsg] = useState(null);
  const [newBlockedIp, setNewBlockedIp] = useState('');
  const [newDevice, setNewDevice] = useState('');
  const [busy, setBusy] = useState(false);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  function refreshAll() {
    refreshStatus();
    refreshSec();
  }

  // ---- Reset akses login satu IP (real-time): rate limit website utama +
  // rate limit dashboard + hapus dari blocklist manual bila ada. ----
  async function resetIpAccess(ip, { removeFromBlocklist = false } = {}) {
    setBusy(true);
    try {
      const calls = [
        csrfFetch(`/api/dev/ip-ratelimit?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' }),
        csrfFetch(`/api/security/login-access?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' }),
      ];
      if (removeFromBlocklist) {
        calls.push(csrfFetch(`/api/dev/system/blocked?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' }));
      }
      // allSettled: walau salah satu gagal, reset lain tetap diproses & hasil
      // parsial tetap dilaporkan (real-time, tidak setengah gagal).
      const settled = await Promise.allSettled(calls);
      const failed = settled.find((s) => s.status === 'rejected');
      const badRes = settled.find((s) => s.status === 'fulfilled' && !s.value.ok);
      if (failed) throw new Error('Salah satu permintaan reset gagal (jaringan).');
      if (badRes) {
        const json = await safeJson(badRes.value);
        throw new Error(json.error || 'Gagal mereset akses.');
      }
      flash('success', `Rate limit & akses login untuk ${ip} direset.`);
      refreshAll();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Reset SEMUA rate limit (website utama + dashboard) ----
  async function resetAllRateLimits() {
    setBusy(true);
    try {
      const results = await Promise.all([
        csrfFetch('/api/dev/ip-ratelimit', { method: 'DELETE' }),
        csrfFetch('/api/security/login-access', { method: 'DELETE' }),
      ]);
      const bad = results.find((r) => !r.ok);
      if (bad) {
        const json = await safeJson(bad);
        throw new Error(json.error || 'Gagal mereset rate limit.');
      }
      flash('success', 'Semua rate limit & akses login direset.');
      refreshAll();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBlocked(ip) {
    try {
      const res = await csrfFetch(`/api/dev/system/blocked?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus IP.');
      flash('success', `${ip} dihapus dari blocklist — akses login dipulihkan.`);
      refreshAll();
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
      flash('success', `${ip} diblokir — akses login & seluruh situs ditolak seketika.`);
      setNewBlockedIp('');
      refreshAll();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Device (MAC / fingerprint perangkat) ----
  async function addDevices(devices) {
    const existing = status?.blockedDevices || [];
    const merged = [...new Set([...existing, ...devices])];
    const res = await csrfFetch('/api/dev/system/blocked-devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices: merged }),
    });
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json.error || 'Gagal memblokir perangkat.');
    return json;
  }

  async function addDevice(e) {
    e.preventDefault();
    const id = newDevice.trim();
    if (!id) return;
    setBusy(true);
    try {
      await addDevices([id]);
      flash('success', `Perangkat ${shortDevice(id)} diblokir — login ditolak seketika.`);
      setNewDevice('');
      refreshAll();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function blockCurrentDevice() {
    const id = getDeviceId();
    if (!id) {
      flash('error', 'Tidak dapat membaca ID perangkat browser ini.');
      return;
    }
    setBusy(true);
    try {
      await addDevices([id]);
      flash('success', `Perangkat ini (${shortDevice(id)}) diblokir.`);
      setNewDevice('');
      refreshAll();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Blokir perangkat yang ikut terrekam pada IP kena rate limit ----
  // Perangkat (fingerprint/"MAC") dicatat otomatis pada setiap percobaan
  // login gagal (real-time) — tombol ini menambahkannya ke blocklist
  // perangkat agar akses dari perangkat itu ditolak seketika.
  async function blockRateLimitedDevice(id) {
    setBusy(true);
    try {
      await addDevices([id]);
      flash('success', `Perangkat ${shortDevice(id)} diblokir — akses login ditolak seketika.`);
      refreshAll();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unblockDevice(id) {
    try {
      const res = await csrfFetch(`/api/dev/system/blocked-devices?device=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal membuka blokir perangkat.');
      flash('success', `Perangkat ${shortDevice(id)} dihapus — akses login dipulihkan.`);
      refreshAll();
    } catch (e) {
      flash('error', e.message);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      flash('success', 'ID perangkat disalin.');
    } catch {
      flash('error', 'Gagal menyalin.');
    }
  }

  const layers = sec?.layers || [];
  const rateLimited = status?.rateLimitedIps || [];
  const blockedIps =
    status?.blockedIpsDetail?.length > 0
      ? status.blockedIpsDetail
      : (status?.blockedIps || []).map((ip) => ({ ip, source: 'runtime' }));
  const blockedDevices = useMemo(
    () =>
      status?.blockedDevicesDetail?.length > 0
        ? status.blockedDevicesDetail
        : (status?.blockedDevices || []).map((id) => ({ id, source: 'runtime' })),
    [status]
  );
  // ID perangkat browser ini — hanya dibaca di klien setelah mount (server
  // tidak punya localStorage), ditunda agar tidak menimbulkan hydration
  // mismatch maupun setState sinkron dalam efek.
  const [myDevice, setMyDevice] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setMyDevice(getDeviceId()), 0);
    return () => clearTimeout(id);
  }, []);

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
            sub="Otomatis diblokir 10 menit setelah 5 percobaan login gagal — real-time."
            icon="activity"
            actions={
              <>
                <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refreshStatus} title="Segarkan">
                  <Icon name="refresh" size={15} />
                  Segarkan
                </button>
                <button
                  className="btn-dev btn-dev-danger btn-sm-dev"
                  onClick={resetAllRateLimits}
                  disabled={busy || rateLimited.length === 0}
                  title="Buka semua blokir rate limit & pulihkan akses login (website utama + dashboard)"
                >
                  <Icon name="refresh" size={15} />
                  Reset Semua
                </button>
              </>
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
                      <th>Dimensi</th>
                      <th>Perangkat (MAC)</th>
                      <th>Sisa Blokir</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateLimited.map((r) => (
                      <tr key={r.ip}>
                        <td><span className="mono">{r.ip}</span></td>
                        <td>{r.count}</td>
                        <td>
                          <span className="pill pill-gray">{(r.dimensions || []).join(' + ') || '-'}</span>
                        </td>
                        <td>
                          {(r.devices || []).length === 0 ? (
                            <span className="text-muted-dev" style={{ fontSize: '0.75rem' }}>—</span>
                          ) : (
                            <div className="d-flex flex-column gap-1 align-items-start">
                              {(r.devices || []).map((id) => (
                                <span key={id} className="d-inline-flex align-items-center gap-1">
                                  <span className="mono" title={id}>{shortDevice(id)}</span>
                                  <button
                                    className="action-btn"
                                    style={{ padding: '1px 5px' }}
                                    title="Blokir perangkat ini (tambah ke blocklist perangkat)"
                                    aria-label={`Blokir perangkat ${id}`}
                                    onClick={() => blockRateLimitedDevice(id)}
                                    disabled={busy}
                                  >
                                    <Icon name="ban" size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td><span className="pill pill-red">{Math.ceil(r.retryAfter / 60)} mnt</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="action-btn"
                            title="Reset rate limit & akses login IP ini"
                            onClick={() => resetIpAccess(r.ip)}
                            disabled={busy}
                          >
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
          <Card
            title="Blocklist IP Manual"
            sub="Berlaku seketika untuk seluruh situs & login admin tanpa restart."
            icon="ban"
          >
            <div
              className="d-flex align-items-start gap-2 mb-3 px-3 py-2"
              style={{ background: 'var(--dev-red-soft)', border: '1px solid var(--dev-red)', borderRadius: 9, fontSize: '0.75rem' }}
            >
              <Icon name="alert" size={14} style={{ color: 'var(--dev-red)', flex: 'none', marginTop: 2 }} />
              <span>
                IP yang diblokir tidak bisa login admin <strong>website utama maupun dashboard ini</strong>. Jangan
                blokir IP/perangkat Anda sendiri — pemulihan hanya lewat perangkat lain atau file{' '}
                <span className="mono">data/dev-state.json</span>.
              </span>
            </div>
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
                      <div className="d-flex align-items-center gap-1 flex-none">
                        <button
                          className="action-btn"
                          title="Reset rate limit & akses login IP ini, lalu hapus dari blocklist"
                          onClick={() => resetIpAccess(ip, { removeFromBlocklist: true })}
                          disabled={busy}
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                        <button className="action-btn danger" title="Hapus dari blocklist" onClick={() => removeBlocked(ip)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
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

      {/* Blocklist device (MAC / fingerprint perangkat) */}
      <Card
        title="Blocklist Perangkat (MAC / Device)"
        sub="Server tidak bisa melihat MAC fisik lewat HTTPS — setiap browser memakai ID perangkat stabil (fingerprint) yang dikirim otomatis pada setiap request admin/login. Perangkat yang diblokir tidak bisa login sama sekali."
        icon="lock"
        actions={
          <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refreshStatus} title="Segarkan">
            <Icon name="refresh" size={15} />
            Segarkan
          </button>
        }
      >
        <form onSubmit={addDevice} className="d-flex gap-2 mb-3 flex-wrap">
          <input
            className="dev-input"
            placeholder="ID perangkat (mis. 3f2a… atau klik tombol di kanan)"
            value={newDevice}
            onChange={(e) => setNewDevice(e.target.value)}
            pattern="[A-Za-z0-9_-]{8,128}"
            title="ID perangkat valid (huruf/angka/-/_)"
          />
          <button className="btn-dev btn-dev-primary btn-sm-dev flex-none" disabled={busy} type="submit">
            <Icon name="plus" size={15} />
            Blokir
          </button>
          <button
            type="button"
            className="btn-dev btn-dev-outline btn-sm-dev flex-none"
            onClick={blockCurrentDevice}
            disabled={busy}
            title="Blokir perangkat browser yang sedang dipakai ini"
          >
            <Icon name="ban" size={15} />
            Blokir Perangkat Ini
          </button>
          {myDevice && (
            <span className="text-muted-dev align-self-center" style={{ fontSize: '0.75rem' }}>
              Perangkat saat ini:{' '}
              <button
                type="button"
                className="action-btn"
                style={{ padding: '1px 6px', fontSize: '0.75rem' }}
                onClick={() => copyText(myDevice)}
                title={`${myDevice} — klik untuk salin`}
              >
                <span className="mono">{shortDevice(myDevice, 10)}</span>
              </button>
            </span>
          )}
        </form>

        {blockedDevices.length === 0 ? (
          <EmptyState icon="checkCircle" title="Tidak ada perangkat diblokir" />
        ) : (
          <div className="d-flex flex-column gap-2">
            {blockedDevices.map(({ id, source }) => (
              <div
                key={id}
                className="d-flex align-items-center justify-content-between gap-2 px-3 py-2"
                style={{ background: 'var(--dev-surface-2)', border: '1px solid var(--dev-border)', borderRadius: 9 }}
              >
                <div className="d-flex align-items-center gap-2 min-w-0">
                  <span className="mono" title={id}>{shortDevice(id, 12)}</span>
                  <button
                    className="action-btn"
                    style={{ padding: '1px 5px' }}
                    title="Salin ID perangkat"
                    onClick={() => copyText(id)}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                  {source === 'env' && <span className="pill pill-gray">env</span>}
                </div>
                <button
                  className="btn-dev btn-dev-outline btn-sm-dev flex-none"
                  title="Hapus dari blocklist & pulihkan akses login perangkat ini"
                  onClick={() => unblockDevice(id)}
                >
                  <Icon name="check" size={14} />
                  Pulihkan Akses
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { Card, Spinner, EmptyState, Modal } from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

// Modul yang dilacak — filter di toolbar.
const MODULES = [
  { value: '', label: 'Semua', icon: 'activity' },
  { value: 'event', label: 'Event', icon: 'calendar' },
  { value: 'banner', label: 'Banner', icon: 'info' },
  { value: 'schedule', label: 'Jadwal', icon: 'clock' },
  { value: 'member', label: 'Anggota', icon: 'user' },
  { value: 'attendance', label: 'Absensi', icon: 'check' },
  { value: 'auth', label: 'Login', icon: 'logIn' },
];

const ACTION_BADGE = {
  create: { label: 'Tambah', cls: 'pill-green' },
  update: { label: 'Ubah', cls: 'pill-blue' },
  delete: { label: 'Hapus', cls: 'pill-red' },
  clear: { label: 'Hapus Semua', cls: 'pill-red' },
  login: { label: 'Login', cls: 'pill-gray' },
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function relativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatTime(iso);
}

export default function ActivityPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [module, setModule] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [msg, setMsg] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/dev/activities?limit=300', { cache: 'no-store' });
        const data = await safeJson(res);
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Gagal memuat log aktivitas.');
        setActivities(data.data || []);
        setError('');
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Hapus SEMUA log aktivitas dari database & tampilan.
  async function handleClearAll() {
    if (confirmText.trim() !== 'HAPUS') return;
    setClearing(true);
    try {
      const res = await csrfFetch('/api/dev/activities?all=1', { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus log aktivitas.');
      setActivities([]);
      setConfirmOpen(false);
      setConfirmText('');
      flash('success', `Seluruh log aktivitas (${data.deleted ?? 0}) berhasil dihapus.`);
    } catch (e) {
      flash('error', e.message);
    } finally {
      setClearing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((a) => {
      if (module && a.module !== module) return false;
      if (!q) return true;
      return (
        String(a.username || '').toLowerCase().includes(q) ||
        String(a.detail || '').toLowerCase().includes(q) ||
        String(a.action || '').toLowerCase().includes(q)
      );
    });
  }, [activities, module, query]);

  return (
    <div className="d-flex flex-column gap-3 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      {error && (
        <div className="alert-dev alert-dev-danger d-flex align-items-center justify-content-between gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-dev btn-dev-ghost btn-sm-dev flex-none" onClick={() => setReloadKey((k) => k + 1)}>
            <Icon name="refresh" size={14} /> Muat ulang
          </button>
        </div>
      )}

      <Card
        title="Log Aktivitas Admin"
        icon="activity"
        actions={
          <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setReloadKey((k) => k + 1)} title="Segarkan">
            <Icon name="refresh" size={15} /> Segarkan
          </button>
        }
      >
        {/* ---- Toolbar filter ---- */}
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {MODULES.map((m) => (
            <button
              key={m.value || 'all'}
              type="button"
              className={`filter-chip ${module === m.value ? 'active' : ''}`}
              onClick={() => setModule(m.value)}
            >
              <Icon name={m.icon} size={14} />
              {m.label}
            </button>
          ))}
          <div className="ms-md-auto position-relative" style={{ minWidth: 230 }}>
            <span
              className="position-absolute top-50 start-0 translate-middle-y ms-3"
              style={{ color: 'var(--dev-muted)', opacity: 0.75, lineHeight: 0 }}
            >
              <Icon name="search" size={14} />
            </span>
            <input
              type="search"
              className="dev-input ps-5"
              placeholder="Cari username / keterangan..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cari aktivitas"
            />
          </div>
        </div>

        {/* ---- Feed aktivitas ---- */}
        {loading ? (
          <Spinner label="Memuat aktivitas..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="activity"
            title={
              activities.length === 0 ? 'Belum ada aktivitas tercatat' : 'Tidak ada aktivitas yang cocok'
            }
          />
        ) : (
          <>
            <div className="d-flex flex-column gap-2">
              {filtered.map((a) => {
                const badge = ACTION_BADGE[a.action] || { label: a.action, cls: 'pill-gray' };
                const mod = MODULES.find((m) => m.value === a.module);
                return (
                  <div key={a.id} className="activity-item">
                    <span className={`activity-icon ${mod ? `mod-${mod.value}` : 'mod-auth'}`}>
                      <Icon name={mod ? mod.icon : 'sparkle'} size={19} />
                    </span>
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <span className="activity-detail">{a.detail || '(tanpa keterangan)'}</span>
                        <span className={`pill ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="activity-meta">
                        <span>
                          <Icon name="user" size={12} />
                          {a.username || '—'}
                        </span>
                        <span>•</span>
                        <span title={formatTime(a.at)}>{relativeTime(a.at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {activities.length >= 300 && (
              <p className="text-center mb-0 mt-3" style={{ fontSize: '0.78rem', color: 'var(--dev-muted)' }}>
                Menampilkan 300 aktivitas terbaru — data lama tetap tersimpan di database.
              </p>
            )}
          </>
        )}
      </Card>

      {/* ---- Zona bahaya: hapus semua log ---- */}
      <section className="danger-zone p-4">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <span className="danger-zone-icon">
            <Icon name="trash" size={19} />
          </span>
          <div className="flex-grow-1" style={{ minWidth: 240 }}>
            <h6 className="mb-1" style={{ fontSize: '0.85rem' }}>Hapus Semua Log Aktivitas</h6>
            <p className="mb-0" style={{ fontSize: '0.78rem' }}>
              Menghapus seluruh log aktivitas admin secara permanen dari database website utama.
            </p>
          </div>
          <button
            type="button"
            className="btn-dev btn-dev-danger px-4"
            disabled={clearing || activities.length === 0}
            onClick={() => setConfirmOpen(true)}
            title={activities.length === 0 ? 'Belum ada log untuk dihapus' : 'Hapus seluruh log aktivitas'}
          >
            {clearing ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Menghapus...
              </>
            ) : (
              <>
                <Icon name="trash" size={16} /> Hapus Semua
              </>
            )}
          </button>
        </div>
      </section>

      {/* ---- Modal konfirmasi hapus semua ---- */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Hapus Semua Log?"
        footer={
          <>
            <button type="button" className="btn-dev btn-dev-outline" onClick={() => setConfirmOpen(false)}>
              Batal
            </button>
            <button
              type="button"
              className="btn-dev btn-dev-danger"
              disabled={confirmText.trim() !== 'HAPUS' || clearing}
              onClick={handleClearAll}
            >
              {clearing ? 'Menghapus...' : 'Hapus Semua'}
            </button>
          </>
        }
      >
        <p className="text-muted-dev" style={{ fontSize: '0.82rem' }}>
          Tindakan ini akan menghapus <strong className="text-danger">{activities.length} log</strong> aktivitas
          secara <strong className="text-danger">permanen</strong> dari database website utama dan tidak dapat
          dibatalkan.
        </p>
        <label className="dev-label" htmlFor="confirm-clear-activity">
          Ketik <strong>HAPUS</strong> untuk melanjutkan
        </label>
        <input
          id="confirm-clear-activity"
          type="text"
          className="dev-input"
          placeholder="HAPUS"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </Modal>
    </div>
  );
}

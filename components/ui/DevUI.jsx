'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

// ---------- Format helpers ----------
export function formatUptime(seconds) {
  const s = Number(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} mnt`;
  if (m > 0) return `${m} menit`;
  return `${s} detik`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function timeAgo(iso) {
  if (!iso) return 'belum pernah';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} mnt lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.floor(h / 24)} hari lalu`;
  } catch {
    return '—';
  }
}

// ---------- Hook: polling real-time ----------
export function usePolling(fn, intervalMs = 6000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);

  // Ref diperbarui di dalam efek (bukan saat render) — pola yang disarankan
  // untuk menghindari interval yang memakai closure basi.
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const result = await fnRef.current();
        if (!alive) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Gagal memuat data');
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      run();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error, loading, refresh: () => setTick((t) => t + 1), tick };
}

// ---------- Card ----------
export function Card({ title, sub, icon, actions, children, className = '', style }) {
  return (
    <section className={`dev-card ${className}`} style={style}>
      {(title || actions) && (
        <div
          className="d-flex align-items-center justify-content-between gap-3 flex-wrap"
          style={{ padding: '1.05rem 1.4rem', borderBottom: '1px solid var(--dev-border)' }}
        >
          <div>
            <h6 className="dev-card-title" style={{ marginBottom: sub ? 2 : 0 }}>
              {icon && <Icon name={icon} size={17} style={{ color: 'var(--dev-blue)' }} />}
              {title}
            </h6>
            {sub && <p className="dev-card-sub mb-0 mt-1">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="dev-card-pad">{children}</div>
    </section>
  );
}

// ---------- Stat card (kompak — nilai + label saja) ----------
// Ikon netral; status ditandai titik kecil berwarna bila `tint` diberikan.
export function StatCard({ icon, tint, value, label }) {
  return (
    <div className="stat-card h-100">
      <span className="stat-icon">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0">
        <div className="stat-value">
          {tint && <span className={`status-dot dot-${tint === 'blue' || tint === 'gray' ? 'gray' : tint}`} style={{ marginRight: 6, verticalAlign: 2 }} />}
          {value}
        </div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

// ---------- Status pill ----------
export function StatusPill({ tone = 'gray', children }) {
  return (
    <span className={`pill pill-${tone}`}>
      <span className={`status-dot dot-${tone === 'green' ? 'green' : tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'gray'}`} />
      {children}
    </span>
  );
}

// ---------- Spinner ----------
export function Spinner({ label = 'Memuat...' }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-muted-dev">
      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      <span style={{ fontSize: '0.85rem' }}>{label}</span>
    </div>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon = 'checkCircle', title, sub }) {
  return (
    <div className="text-center py-5">
      <Icon name={icon} size={34} style={{ color: 'var(--dev-muted)', opacity: 0.6 }} />
      <div className="fw-semibold mt-2" style={{ color: 'var(--dev-text)' }}>
        {title}
      </div>
      {sub && <div className="text-muted-dev" style={{ fontSize: '0.82rem' }}>{sub}</div>}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="dev-modal-backdrop" onClick={onClose}>
      <div className="dev-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="mb-0">{title}</h6>
          <button className="action-btn" onClick={onClose} aria-label="Tutup">
            <Icon name="xCircle" size={17} />
          </button>
        </div>
        {children}
        {footer && <div className="d-flex justify-content-end gap-2 mt-4">{footer}</div>}
      </div>
    </div>
  );
}

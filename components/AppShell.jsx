'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import { csrfFetch } from '@/lib/csrfClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:22889';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', exact: true },
  { href: '/system', label: 'System', icon: 'wrench' },
  { href: '/account', label: 'Account', icon: 'users' },
  { href: '/security', label: 'Security', icon: 'shield' },
  { href: '/absensi', label: 'Absensi', icon: 'archive' },
  { href: '/activity', label: 'Aktivitas', icon: 'activity' },
];

function isActive(n, pathname) {
  return n.exact ? pathname === n.href : pathname.startsWith(n.href);
}

function PageTitle({ pathname }) {
  const map = {
    '/dashboard': 'Dashboard',
    '/system': 'System',
    '/account': 'Account',
    '/security': 'Security',
    '/absensi': 'Absensi',
    '/activity': 'Aktivitas',
  };
  return <div className="dev-topbar-title">{map[pathname] || 'Console'}</div>;
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await csrfFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="dev-shell">
      {/* Sidebar desktop */}
      <aside className="dev-sidebar p-3">
        <Link href="/dashboard" className="d-flex align-items-center gap-3 text-decoration-none px-2 pt-2 pb-4">
          <span className="brand-logo">
            <Icon name="shield" size={17} />
          </span>
          <span className="brand-name">Eluzai Dev</span>
        </Link>

        <nav className="dev-nav">
          {NAV.map((n) => {
            const active = isActive(n, pathname);
            return (
              <Link key={n.href} href={n.href} className={`dev-nav-link ${active ? 'active' : ''}`}>
                <Icon name={n.icon} size={18} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="d-flex flex-column gap-2 pt-3" style={{ borderTop: '1px solid var(--dev-border)' }}>
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="dev-nav-link"
            title={`Buka website utama (${SITE_URL})`}
          >
            <Icon name="external" size={18} />
            Lihat Website Utama
          </a>
          <button onClick={logout} disabled={loggingOut} className="dev-nav-link w-100 text-start" style={{ color: 'var(--dev-red)' }}>
            <Icon name="logout" size={18} />
            {loggingOut ? 'Keluar...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <div className="d-md-none position-sticky top-0" style={{ zIndex: 1035, background: 'var(--dev-surface)', borderBottom: '1px solid var(--dev-border)' }}>
        <div className="d-flex align-items-center justify-content-between px-3 py-2">
          <Link href="/dashboard" className="d-flex align-items-center gap-2 text-decoration-none">
            <span className="brand-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Icon name="shield" size={17} />
            </span>
            <span className="fw-bold" style={{ fontSize: '0.95rem' }}>Eluzai Dev</span>
          </Link>
          <div className="d-flex gap-2 align-items-center">
            <ThemeToggle compact />
            <button onClick={logout} disabled={loggingOut} className="icon-btn" aria-label="Keluar" title="Keluar" style={{ color: 'var(--dev-red)' }}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
        <div className="d-flex gap-1 px-3 pb-2" style={{ overflowX: 'auto' }}>
          {NAV.map((n) => {
            const active = isActive(n, pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="btn btn-sm"
                style={
                  active
                    ? { background: 'var(--dev-blue)', color: '#fff', borderRadius: 9, fontWeight: 600 }
                    : { color: 'var(--dev-muted)', borderRadius: 9 }
                }
              >
                {n.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Konten */}
      <div className="dev-main">
        <header className="dev-topbar d-none d-md-flex">
          <PageTitle pathname={pathname} />
          <div className="d-flex align-items-center gap-2">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn"
              title="Buka website utama di tab baru"
            >
              <Icon name="external" size={17} />
            </a>
            <ThemeToggle compact />
          </div>
        </header>
        <main className="dev-content">{children}</main>
      </div>
    </div>
  );
}

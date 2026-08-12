'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import { csrfFetch } from '@/lib/csrfClient';
import logo from './logo-placeholder.webp';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:22889';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home', exact: true },
  { href: '/system', label: 'System', icon: 'settings' },
  { href: '/account', label: 'Account', icon: 'users' },
  { href: '/security', label: 'Security', icon: 'shield' },
  { href: '/absensi', label: 'Absensi', icon: 'archive' },
  { href: '/activity', label: 'Aktivitas', icon: 'activity' },
];

function isActive(n, pathname) {
  return n.exact ? pathname === n.href : pathname.startsWith(n.href);
}

function PageTitle({ children }) {
  return <div className="dev-topbar-title">{children}</div>;
}

// Judul halaman diturunkan dari NAV — satu sumber kebenaran, tidak duplikat.
const PAGE_TITLES = Object.fromEntries(NAV.map((n) => [n.href, n.label]));

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const pageTitle = PAGE_TITLES[pathname] || 'Console';

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
          <Image src={logo} alt="Logo Eluzai Kids" width={34} height={34} className="brand-logo-img" />
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

      {/* Topbar mobile — logo & aksi, tanpa menu (menu pindah ke tab bar bawah) */}
      <div className="d-md-none position-sticky top-0" style={{ zIndex: 1035, background: 'var(--dev-surface)', borderBottom: '1px solid var(--dev-border)' }}>
        <div className="d-flex align-items-center justify-content-between px-3 py-2">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <Link href="/dashboard" className="d-flex align-items-center gap-2 text-decoration-none flex-none">
              <Image src={logo} alt="Logo Eluzai Kids" width={34} height={34} className="brand-logo-img" />
              <span className="fw-bold" style={{ fontSize: '0.95rem' }}>Eluzai Dev</span>
            </Link>
            <span
              className="dev-topbar-title d-none d-sm-block"
              style={{ fontSize: '0.78rem', color: 'var(--dev-muted)', whiteSpace: 'nowrap' }}
            >
              · {pageTitle}
            </span>
          </div>
          <div className="d-flex gap-2 align-items-center flex-none">
            <ThemeToggle />
            <button onClick={logout} disabled={loggingOut} className="icon-btn" aria-label="Keluar" title="Keluar" style={{ color: 'var(--dev-red)' }}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar bawah mobile — seperti aplikasi profesional: ikon saja */}
      <nav className="dev-tabbar d-md-none" aria-label="Navigasi utama">
        {NAV.map((n) => {
          const active = isActive(n, pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`dev-tab ${active ? 'active' : ''}`}
              aria-label={n.label}
              aria-current={active ? 'page' : undefined}
              title={n.label}
            >
              <Icon name={n.icon} size={22} />
            </Link>
          );
        })}
      </nav>

      {/* Konten */}
      <div className="dev-main">
        <header className="dev-topbar d-none d-md-flex">
          <PageTitle>{pageTitle}</PageTitle>
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

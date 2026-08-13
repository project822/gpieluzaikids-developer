'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';
import { csrfFetch, safeJson } from '@/lib/csrfClient';
import logo from './logo-placeholder.webp';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await csrfFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Login gagal');
      // Cegah open redirect: hanya izinkan jalur internal (mulai '/',
      // bukan '//', '\\', atau skema lain).
      const from = searchParams.get('from');
      const target =
        from && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\') ? from : '/dashboard';
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-4">
        <Image src={logo} alt="Logo Eluzai Kids" width={64} height={64} className="login-logo" />
        <h4 className="mb-1" style={{ fontWeight: 700 }}>
          Eluzai Kids Developer
        </h4>
        <p className="text-muted-dev mb-0" style={{ fontSize: '0.83rem' }}>
          Masuk untuk mengelola website utama
        </p>
      </div>

      {error && (
        <div className="alert-dev alert-dev-danger mb-3" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <label className="dev-label" htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            className="dev-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            placeholder="developer"
          />
        </div>
        <div className="mb-4">
          <label className="dev-label" htmlFor="login-password">
            Password
          </label>
          <div className="position-relative">
            <input
              id="login-password"
              className="dev-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              style={{ paddingRight: 42 }}
            />
            {/* Tombol transparan tanpa latar/bingkai — ikon mata beraksen biru
                (sama dengan warna tombol Masuk). Pola identik dengan halaman
                admin: mata biasa saat tersembunyi, mata tercoret saat sedang
                menampilkan password. Posisi benar-benar pas di tengah input. */}
            <button
              type="button"
              className="position-absolute"
              style={{
                top: '50%',
                right: 7,
                width: 30,
                height: 30,
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--dev-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
              }}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
            </button>
          </div>
        </div>
        <button type="submit" className="btn-dev btn-dev-masuk w-100" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Memeriksa...
            </>
          ) : (
            <>
              {/* Ikon pintu masuk — arah panah berlawanan dari semula (ke
                  kanan/ke dalam pintu) & warna biru identik tombol Masuk
                  admin (#1d4ed8); di dark-mode pakai var primary agar tetap
                  terbaca (lihat .masuk-icon di globals.css). */}
              <Icon name="logout" size={16} className="masuk-icon" />
              Masuk
            </>
          )}
        </button>
      </form>
    </>
  );
}

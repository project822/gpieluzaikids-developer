'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';
import { csrfFetch, safeJson } from '@/lib/csrfClient';

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
      router.push(searchParams.get('from') || '/dashboard');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-4">
        <span className="brand-logo mx-auto mb-3" style={{ width: 52, height: 52, display: 'flex', borderRadius: 14 }}>
          <Icon name="shield" size={26} />
        </span>
        <h4 className="mb-1" style={{ fontWeight: 700 }}>
          Eluzai Dev Console
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
            <button
              type="button"
              className="action-btn position-absolute"
              style={{ top: 4, right: 4 }}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              <Icon name={showPassword ? 'eye' : 'lock'} size={15} />
            </button>
          </div>
        </div>
        <button type="submit" className="btn-dev btn-dev-primary w-100" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Memeriksa...
            </>
          ) : (
            <>
              <Icon name="logout" size={16} style={{ transform: 'rotate(180deg)' }} />
              Masuk
            </>
          )}
        </button>
      </form>
    </>
  );
}

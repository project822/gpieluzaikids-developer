import { NextResponse } from 'next/server';
import {
  dashboardCredentials,
  safeCompare,
  issueToken,
  tokenCookieOptions,
  TOKEN_COOKIE,
} from '@/lib/auth';
import { checkRateLimit, registerFailure, clearRateLimit } from '@/lib/rateLimit';
import { logSecurityEvent } from '@/lib/securityLog';

function getIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request) {
  const ip = getIp(request);

  try {
    const body = await request.json();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    // Anti brute-force (SECURITY.md #9): 5 percobaan gagal / 15 menit →
    // blokir 10 menit. Berlaku per IP, per username, dan per pasangan.
    const rl = checkRateLimit({ ip, username });
    if (rl.blocked) {
      logSecurityEvent({
        type: 'rate_limit',
        ip,
        path: '/api/auth/login',
        detail: `Login diblokir (${rl.retryAfterSec}s)`,
      });
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(rl.retryAfterSec) },
        }
      );
    }

    const creds = dashboardCredentials();
    const usernameOk = safeCompare(username.toLowerCase(), String(creds.username || '').toLowerCase());
    const passwordOk = safeCompare(password, creds.password);

    if (!usernameOk || !passwordOk) {
      registerFailure({ ip, username });
      logSecurityEvent({ type: 'failed_login', ip, path: '/api/auth/login', detail: `username="${username}"` });
      return NextResponse.json(
        { error: 'Username atau password salah.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Login sukses → bersihkan hitungan gagal.
    clearRateLimit({ ip, username });

    const token = await issueToken({ sub: creds.username, role: 'developer' });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(TOKEN_COOKIE, token, tokenCookieOptions());
    return res;
  } catch (error) {
    console.error('[api/auth/login]', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan pada server.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

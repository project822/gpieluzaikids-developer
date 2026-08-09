// Proxy dashboard (Next.js 16): lapisan autentikasi, CSRF & pertahanan dasar.
//   - Semua halaman (kecuali /login)  → wajib sesi JWT (cookie dev_token)
//   - Semua /api/* (kecuali /api/auth/*) → wajib sesi JWT
//   - State-changing /api/* → CSRF double-submit (cookie dev_csrf ↔ X-CSRF-Token)
//     kecuali /api/auth/login (belum punya token).
//   - State-changing /api/* → cek Origin (hanya dashboard sendiri) + batas body
//     (Content-Length ≤ 100kb) — anti CSRF tingkat lanjut & anti DoS.
//   - Cookie CSRF disediakan bila belum ada.

import { NextResponse } from 'next/server';
import { verifyToken, TOKEN_COOKIE } from '@/lib/auth';
import {
  CSRF_COOKIE,
  csrfCookieOptions,
  generateCsrfToken,
  csrfMatches,
} from '@/lib/csrfServer';
import { logSecurityEvent } from '@/lib/securityLog';
import { getClientIp, isIpBlocked } from '@/lib/security';

const STATE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_BODY_BYTES = 100 * 1024; // 100kb — dashboard tidak mengunggah file besar

// Pastikan cookie CSRF selalu tersedia pada respons halaman maupun API.
function ensureCsrfCookie(response, request) {
  if (!request.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());
  }
  return response;
}

// Origin whitelist: state-changing hanya boleh dari host dashboard sendiri
// (pola SECURITY.md #3). Tanpa header Origin (curl/server) tetap dilindungi
// CSRF token — request browser POST selalu membawa Origin.
// Referensi host memakai header `Host` (bukan nextUrl.hostname yang bisa
// dinormalisasi, mis. 127.0.0.1 → localhost di dev server).
function extractHostname(hostHeader) {
  const h = String(hostHeader || '');
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return h.slice(1, end > -1 ? end : undefined).toLowerCase();
  }
  return h.split(':')[0].toLowerCase();
}

function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    // new URL().hostname menyertakan bracket untuk IPv6 — samakan dengan
    // extractHostname (yang membuang bracket) agar [::1] tidak tertolak.
    const originHost = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const requestHost = extractHostname(request.headers.get('host') || request.nextUrl.host);
    return originHost === requestHost;
  } catch {
    return false;
  }
}

function bodyTooLarge(request) {
  const len = Number(request.headers.get('content-length') || 0);
  return len > MAX_BODY_BYTES;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIp(request);

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  const valid = Boolean(payload);

  const isApi = pathname.startsWith('/api/');
  const isAuthApi = pathname.startsWith('/api/auth/');
  const isLogin = pathname === '/login';

  // 0) Blokir IP dari env BLOCKED_IPS (opsional — pola sama dengan website
  //    utama, lib/security.js). Berlaku untuk semua permintaan.
  if (isIpBlocked(ip)) {
    logSecurityEvent({ type: 'blocked_ip', ip, path: pathname, detail: 'IP ada di BLOCKED_IPS' });
    return isApi
      ? NextResponse.json({ error: 'IP diblokir.' }, { status: 403 })
      : new NextResponse('Forbidden', { status: 403 });
  }

  // 1) API auth: bebas akses (login/logout/session).
  if (isApi && isAuthApi) {
    return ensureCsrfCookie(NextResponse.next(), request);
  }

  // 2) API lainnya: wajib sesi.
  if (isApi) {
    if (!valid) {
      logSecurityEvent({ type: 'auth', ip, path: pathname, detail: 'API tanpa sesi valid' });
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }
    // Pertahanan untuk metode state-changing.
    if (STATE_METHODS.includes(method)) {
      if (!originAllowed(request)) {
        logSecurityEvent({ type: 'origin', ip, path: pathname, detail: `Origin ditolak: ${request.headers.get('origin') || '-'}` });
        return NextResponse.json({ error: 'Origin tidak diizinkan.' }, { status: 403 });
      }
      if (bodyTooLarge(request)) {
        logSecurityEvent({ type: 'body_limit', ip, path: pathname, detail: `Content-Length melebihi ${MAX_BODY_BYTES} byte` });
        return NextResponse.json({ error: 'Ukuran body terlalu besar.' }, { status: 413 });
      }
      const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
      const headerToken = request.headers.get('x-csrf-token');
      if (!(await csrfMatches(cookieToken, headerToken))) {
        logSecurityEvent({ type: 'csrf', ip, path: pathname, detail: 'Token CSRF tidak cocok' });
        return NextResponse.json({ error: 'Token CSRF tidak valid.' }, { status: 403 });
      }
    }
    return ensureCsrfCookie(NextResponse.next(), request);
  }

  // 3) Halaman login: sudah login → arahkan ke dashboard.
  if (isLogin) {
    return valid ? NextResponse.redirect(new URL('/dashboard', request.url)) : NextResponse.next();
  }

  // 4) Halaman lain: wajib login.
  if (!valid) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // 5) Pastikan cookie CSRF tersedia untuk sesi aktif.
  return ensureCsrfCookie(NextResponse.next(), request);
}

export const config = {
  // Seluruh aset & HMR dev (termasuk ws upgrade _next/hmr) tidak masuk
  // middleware — hanya halaman & API yang diproteksi.
  matcher: ['/((?!_next/|favicon.ico|.*\\..*).*)'],
};

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
import { siteFetch } from '@/lib/siteApi';
import { getClientIp } from '@/lib/security';

// ---------- Blocklist real-time (sumber kebenaran: website utama) ----------
// Login dashboard ikut diblokir oleh blocklist IP & device yang dikelola
// dari halaman Security (single source of truth di website utama).
// Dibaca via /api/dev/status dengan cache singkat (1,5 detik) — satu panggilan
// HTTP kecil per interval, tidak membebani jalur login, dan perubahan blocklist
// dari halaman Security terlihat hampir seketika.
const BLOCK_CACHE_MS = 1500;

// Batas ketat khusus endpoint login (endpoint auth dikecualikan dari cek
// body 100kb di proxy.js — di sini kami terapkan batas sendiri agar penyerang
// tanpa autentikasi tidak bisa membanjiri request.json() dengan body raksasa).
const MAX_LOGIN_BODY_BYTES = 8 * 1024;
const MAX_USERNAME_LENGTH = 64; // key rate-limit & log — cegah map key raksasa
const MAX_DEVICE_ID_LENGTH = 128; // dimasukkan ke klaim JWT — cegah token membengkak

async function getBlockData() {
  const g = globalThis;
  const now = Date.now();
  if (g._eluzaiDevBlockCache && now - g._eluzaiDevBlockCache.at < BLOCK_CACHE_MS) {
    return g._eluzaiDevBlockCache.data;
  }
  const res = await siteFetch('/api/dev/status', { method: 'GET' });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  g._eluzaiDevBlockCache = { at: now, data };
  return data;
}

function invalidateBlockCache() {
  if (globalThis._eluzaiDevBlockCache) globalThis._eluzaiDevBlockCache.at = 0;
}

export async function POST(request) {
  const ip = getClientIp(request);

  try {
    // Tolak cepat sebelum parsing bila header Content-Length mencurigakan
    // (atau lebih besar dari batas). Request tanpa Content-Length (chunked)
    // tetap melewati JSON.parse — batas field di bawah tetap membatasi dampak.
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_LOGIN_BODY_BYTES) {
      logSecurityEvent({
        type: 'body_limit',
        ip,
        path: '/api/auth/login',
        detail: `Content-Length ${contentLength} > ${MAX_LOGIN_BODY_BYTES}`,
      });
      return NextResponse.json(
        { error: 'Ukuran body terlalu besar.' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    const username = String(body?.username || '').trim().slice(0, MAX_USERNAME_LENGTH);
    const password = String(body?.password || '');
    const deviceId = String(request.headers.get('x-device-id') || '').trim().slice(0, MAX_DEVICE_ID_LENGTH);

    // 0) Blocklist IP + perangkat (real-time) — sebelum verifikasi apa pun.
    //    Fail-open bila website utama tidak terjangkau (login tetap bisa
    //    dipakai admin; kejadian dicatat di log).
    const block = await getBlockData().catch(() => null);
    if (block) {
      const blockedIps = Array.isArray(block.blockedIps) ? block.blockedIps : [];
      const blockedDevices = Array.isArray(block.blockedDevices) ? block.blockedDevices : [];

      if (blockedIps.includes(ip)) {
        logSecurityEvent({
          type: 'blocked_ip',
          ip,
          path: '/api/auth/login',
          detail: 'IP ada di blocklist website utama — login dashboard ditolak',
        });
        return NextResponse.json(
          { error: 'IP Anda diblokir. Hubungi administrator.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (deviceId && blockedDevices.includes(deviceId)) {
        logSecurityEvent({
          type: 'blocked_device',
          ip,
          path: '/api/auth/login',
          detail: `perangkat diblokir: ${deviceId.slice(0, 16)}…`,
        });
        return NextResponse.json(
          { error: 'Akses dari perangkat ini diblokir.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    } else {
      logSecurityEvent({
        type: 'auth',
        ip,
        path: '/api/auth/login',
        detail: 'website utama tidak terjangkau — cek blocklist dilewati (fail-open)',
      });
    }

    // Anti brute-force (SECURITY.md #9): 5 percobaan gagal / 15 menit →
    // blokir 10 menit. Berlaku per IP, per username, dan per pasangan.
    // Store bersama MongoDB (lintas instance serverless) — lihat lib/rateLimit.js.
    const rl = await checkRateLimit({ ip, username });
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
      // deviceId ikut direkam agar perangkat pelaku bisa diblokir juga.
      await registerFailure({ ip, username, deviceId });
      // reason (hanya di log server, tidak dikirim ke client): username | password
      // membantu diagnosis cepat — mis. DASHBOARD_PASSWORD di Vercel punya spasi
      // tersembunyi atau nilai env-nya tidak cocok dengan yang diketik.
      logSecurityEvent({
        type: 'failed_login',
        ip,
        path: '/api/auth/login',
        detail: `username="${username}" reason=${usernameOk ? 'password' : 'username'}`,
      });
      return NextResponse.json(
        { error: 'Username atau password salah.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Login sukses → bersihkan hitungan gagal.
    await clearRateLimit({ ip, username });
    invalidateBlockCache();

    // Klaim `dev` = ID perangkat saat login → proxy.js menolak pemakaian
    // token dari perangkat lain (bila header X-Device-Id dikirim).
    const token = await issueToken({
      sub: creds.username,
      role: 'developer',
      ...(deviceId ? { dev: deviceId } : {}),
    });
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

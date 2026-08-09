// Helper CSRF server-side (dipakai proxy.js dashboard).

export const CSRF_COOKIE = 'dev_csrf';

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function generateCsrfToken() {
  return crypto.randomUUID();
}

// Perbandingan konstan-waktu (anti timing attack).
export async function csrfMatches(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

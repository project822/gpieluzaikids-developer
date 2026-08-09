// ============================================================
// Helper keamanan umum dashboard — pola sama dengan website
// utama (D:\church/lib/security.js).
//
// Pembagian peran di project ini:
//   - CSRF double-submit cookie  → lib/csrfServer.js (dev_csrf)
//   - Rate limiting login        → lib/rateLimit.js
//   - Sesi JWT dashboard         → lib/auth.js (dev_token)
//   - Di sini: IP asli klien (trust proxy) + blokir IP via env
//     BLOCKED_IPS (opsional) — sama seperti website utama.
//
// File ini tidak mengimpor modul Node murni sehingga aman dipakai
// di proxy (edge/node runtime).
// ============================================================

// IP asli klien — trust proxy (Vercel/Edge menaruh x-forwarded-for).
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

// Daftar IP yang diblokir — env BLOCKED_IPS="1.2.3.4,5.6.7.8" (opsional).
// Kosong = tidak ada blokir. Dipakai proxy.js untuk menolak permintaan.
export function isIpBlocked(ip) {
  const raw = (process.env.BLOCKED_IPS || '').trim();
  if (!raw) return false;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ip);
}

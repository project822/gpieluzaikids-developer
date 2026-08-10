// Rate limiting login dashboard (anti brute-force) — pola sama dengan
// website utama (D:\church). Melacak 3 dimensi sekaligus:
//   per IP, per username, per IP+username.
// Default: 5 percobaan gagal / 15 menit → blokir 10 menit (429 + Retry-After).
// Store in-memory per instance (serverless/Node) — cukup efektif melawan
// brute-force dari satu sumber.

const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const BLOCK_MS = 10 * 60 * 1000; // 10 menit
const MAX_ATTEMPTS = 5;

const store = new Map(); // key → { count, firstAt, blockedUntil }

function keyFor(ip, username) {
  const u = String(username || '').toLowerCase().trim();
  return {
    ip: `ip:${ip}`,
    user: `user:${u}`,
    pair: `pair:${ip}|${u}`,
  };
}

// Bersihkan entri basi (anti memory leak) — dipanggil di tiap cek.
function prune(now = Date.now()) {
  if (store.size < 2000) return;
  for (const [key, rec] of store) {
    const expired = !rec.blockedUntil && now - rec.firstAt > WINDOW_MS;
    const blockOver = rec.blockedUntil && rec.blockedUntil <= now;
    if (expired || blockOver) store.delete(key);
  }
}

function getRec(key, now) {
  const rec = store.get(key);
  if (!rec) return null;
  // Blokir selesai → reset.
  if (rec.blockedUntil && rec.blockedUntil <= now) {
    store.delete(key);
    return null;
  }
  return rec;
}

export function checkRateLimit({ ip = 'unknown', username = '' } = {}) {
  const now = Date.now();
  prune(now);
  const keys = keyFor(ip, username);
  for (const k of Object.values(keys)) {
    const rec = getRec(k, now);
    if (rec?.blockedUntil) {
      const retryAfterSec = Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000));
      return { blocked: true, retryAfterSec, key: k };
    }
  }
  return { blocked: false };
}

export function registerFailure({ ip = 'unknown', username = '' } = {}) {
  const now = Date.now();
  const keys = keyFor(ip, username);
  const entries = [];
  let exceeded = false;
  for (const k of Object.values(keys)) {
    let rec = getRec(k, now);
    if (rec) {
      rec.count += 1;
      if (rec.count >= MAX_ATTEMPTS && !rec.blockedUntil) exceeded = true;
    } else {
      rec = { count: 1, firstAt: now, blockedUntil: null };
    }
    entries.push([k, rec]);
  }
  // Bila salah satu dimensi melewati batas, blokir ketiganya sekaligus
  // (ip, user, pair) — selaras dengan website utama agar IP pelaku tampil
  // di daftar IP terblokir dan pergantian username tidak lolos.
  if (exceeded) {
    for (const [, rec] of entries) rec.blockedUntil = now + BLOCK_MS;
  }
  for (const [k, rec] of entries) store.set(k, rec);
}

export function clearRateLimit({ ip = 'unknown', username = '' } = {}) {
  const keys = keyFor(ip, username);
  for (const k of Object.values(keys)) store.delete(k);

  // Bila hanya IP yang diberikan (reset akses per-IP), bersihkan juga dimensi
  // username yang terblokir bersama IP itu (key pair:ip|user) — supaya akses
  // login benar-benar pulih untuk IP tersebut.
  if (ip && !username) {
    for (const key of [...store.keys()]) {
      if (key.startsWith(`pair:${ip}|`)) {
        const user = key.slice(`pair:${ip}|`.length);
        if (user) store.delete(`user:${user}`);
        store.delete(key);
      }
    }
  }
}

export function resetAllRateLimits() {
  store.clear();
}

export function rateLimitStats() {
  const now = Date.now();
  prune(now);
  const blocked = [];
  for (const [key, rec] of store) {
    if (rec.blockedUntil && rec.blockedUntil > now) {
      blocked.push({
        key,
        count: rec.count,
        retryAfterSec: Math.ceil((rec.blockedUntil - now) / 1000),
      });
    }
  }
  return blocked;
}

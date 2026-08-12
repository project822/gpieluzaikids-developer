// Auth sesi dashboard developer (login mandiri, single user).
// Token JWT disimpan di cookie httpOnly (dev_token).
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);
const SCRYPT_KEYLEN = 64;

export const TOKEN_COOKIE = 'dev_token';
export const TOKEN_MAX_AGE = 60 * 60 * 24; // 1 hari

export const DEFAULT_SECRET = 'eluzai-dev-dashboard-secret-ganti-di-produksi';

export function getSecret() {
  // Di produksi DASHBOARD_SECRET wajib diisi — jangan pernah memakai nilai
  // default (pola SECURITY.md #7/#11): jika default dipakai, token bisa
  // dipalsukan siapa pun yang tahu nilainya.
  if (process.env.NODE_ENV === 'production' && !process.env.DASHBOARD_SECRET) {
    throw new Error(
      'DASHBOARD_SECRET wajib diisi di produksi. Buat dengan: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return new TextEncoder().encode(process.env.DASHBOARD_SECRET || DEFAULT_SECRET);
}

// Guard produksi — jangan biarkan nilai default/dikosongkan dipakai
// di produksi (pola yang sama dengan issueToken di website utama).
export async function issueToken(payload) {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DASHBOARD_SECRET || process.env.DASHBOARD_SECRET === DEFAULT_SECRET)
  ) {
    throw new Error(
      'DASHBOARD_SECRET wajib diisi di produksi (bukan nilai default). Buat dengan: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return signToken(payload);
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(getSecret());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

// Hash password scrypt (format scrypt$<salt-hex>$<hash-hex>) — sama dengan
// website utama (D:\church/lib/auth.js) agar user admin dibuat dari sini bisa
// langsung dipakai login di /admin website utama.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(String(password || ''), Buffer.from(salt, 'hex'), SCRYPT_KEYLEN);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

// Perbandingan konstan-waktu (anti timing attack).
export function safeCompare(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function dashboardCredentials() {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DASHBOARD_USERNAME || !process.env.DASHBOARD_PASSWORD)
  ) {
    throw new Error(
      'DASHBOARD_USERNAME dan DASHBOARD_PASSWORD wajib diisi di produksi — jangan memakai kredensial default.'
    );
  }
  return {
    username: process.env.DASHBOARD_USERNAME || 'developer',
    password: process.env.DASHBOARD_PASSWORD || 'developer123',
  };
}

export function tokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
    priority: 'high',
  };
}

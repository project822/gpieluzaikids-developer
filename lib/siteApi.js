// Akses server-side ke API website utama (D:\church).
// File ini HANYA boleh dipakai di route handler (server) — X-Dev-Key
// tidak boleh bocor ke browser.
import { headers as nextHeaders } from 'next/headers';

// Fallback sesuai environment: di produksi arahkan ke situs utama yang
// sudah online (sama dengan fallback di next.config.mjs) alih-alih
// localhost yang tidak terjangkau dari serverless Vercel.
export const SITE_BASE_URL =
  process.env.SITE_BASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://gpieluzaikids.vercel.app'
    : 'http://localhost:22889');

export function devApiKey() {
  return process.env.DEV_API_KEY || '';
}

// Ambil alamat IP dashboard yang sedang login (dipakai untuk mengecualikan
// IP sendiri dari tampilan "IP terblokir" bila memang IP tersebut diblokir
// di website utama).
export async function getClientIp() {
  const h = await nextHeaders();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

// Fetch ke API website utama. Mengembalikan { ok, status, data } — bila
// website utama tidak terjangkau, status = 0 dan error = 'site_offline'.
export async function siteFetch(path, { method = 'GET', body } = {}) {
  const url = `${SITE_BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const key = devApiKey();
  if (key) headers['X-Dev-Key'] = key;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 0, error: 'site_offline', data: null };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Respons non-JSON (mis. halaman 503 maintenance).
  }
  return { ok: res.ok, status: res.status, data, error: data?.error || null };
}

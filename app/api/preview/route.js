// Preview website utama. Website utama mengirim X-Frame-Options: DENY +
// frame-ancestors 'none', sehingga iframe langsung akan diblokir browser.
// Solusi: dashboard mengambil HTML via server (bukan browser), lalu
// dirender dalam iframe sandbox (statis) dengan <base> menunjuk website
// utama.
//
// Skrip HTML dihapus di sini: preview dibuat statis (CSS & gambar tetap
// dimuat via <base>), sehingga tampilannya akurat seperti website asli
// tanpa bergantung pada hydration/JS website utama di dalam sandbox.

import { SITE_BASE_URL } from '@/lib/siteApi';

function stripScripts(html) {
  // Hapus seluruh blok <script>...</script> dan <script .../>.
  // Eksekusi kode juga sudah diblokir ganda oleh sandbox="" (tanpa
  // allow-scripts) pada iframe — tidak perlu manipulasi lain yang agresif.
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    // Hapus atribut event on* (pertahanan berlapis).
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

export async function GET() {
  let res;
  try {
    res = await fetch(`${SITE_BASE_URL}/`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return Response.json({ ok: false, status: 0, error: 'offline' });
  }

  const html = await res.text();
  return Response.json({
    ok: res.ok,
    status: res.status,
    html: stripScripts(html),
    finalUrl: `${SITE_BASE_URL}/`,
  });
}

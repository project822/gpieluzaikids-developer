// ============================================================
// Sanitasi input (anti Stored XSS) — pola sama dengan website
// utama (D:\church/lib/sanitize.js).
// Lapisan pertama: buang semua tag HTML dari string user
// sebelum disimpan. Lapisan kedua: React auto-escape saat
// render, jadi konten ditampilkan sebagai teks.
//
// Juga memuat validasi data-URL gambar (whitelist MIME) —
// untuk pola upload data-URL proyek ini.
// ============================================================

const TAG_REGEX = /<[^>]*>/g;

export function sanitizeString(value) {
  return String(value ?? '').replace(TAG_REGEX, '').trim();
}

// Sanitasi rekursif seluruh payload. Field `image` (data-URL
// base64/encoded) dilewati agar tidak dirusak.
export function sanitizePayload(body) {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitizePayload);
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'image') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = sanitizeString(value);
    } else if (value && typeof value === 'object') {
      out[key] = sanitizePayload(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Validasi gambar: data-URL dengan MIME whitelist + batas ukuran.
// SVG diizinkan (dipakai data demo, di-encode via encodeURIComponent —
// TIDAK pernah mengandung karakter '<' mentah).
const IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp|svg\+xml);/i;
export const MAX_IMAGE_CHARS = 7_000_000;

export function isValidImage(img) {
  return (
    typeof img === 'string' &&
    img.length > 0 &&
    img.length < MAX_IMAGE_CHARS &&
    IMAGE_PATTERN.test(img) &&
    // Tolak payload dengan HTML mentah (mis. data:image/svg+xml,<svg onload=…>)
    // — SVG yang di-encode (base64/percent-encoded) tidak memuat '<'.
    !img.includes('<') &&
    !img.includes('>')
  );
}

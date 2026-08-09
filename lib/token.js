// ============================================================
// Paritas struktur dengan website utama (D:\church/lib/token.js).
// Di dashboard ini, implementasi token JWT sudah ada di
// lib/auth.js (cookie dev_token, secret DASHBOARD_SECRET, guard
// produksi). File ini hanya re-export agar pemanggil di masa
// depan memakai API yang sama seperti website utama, tanpa
// duplikasi logika.
// ============================================================

export {
  TOKEN_COOKIE,
  TOKEN_MAX_AGE,
  DEFAULT_SECRET,
  getSecret,
  signToken,
  verifyToken,
} from './auth';

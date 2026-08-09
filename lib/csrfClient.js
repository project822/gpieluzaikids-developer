// Client-side CSRF (double-submit cookie) untuk API dashboard.
// Membungkus fetch() agar otomatis menambahkan header X-CSRF-Token
// (dibaca dari cookie dev_csrf) pada metode state-changing, dan
// mengarahkan ke /login bila sesi kedaluwarsa (401).
// Hanya boleh diimpor dari komponen client.

export const CSRF_COOKIE = 'dev_csrf';

export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

const STATE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Sesi kedaluwarsa / belum login → kembali ke halaman login.
function redirectIfUnauthed(res) {
  if (res.status === 401 && typeof window !== 'undefined') {
    const from = window.location.pathname + window.location.search;
    // Modul util non-komponen → tidak bisa memakai useRouter(); redirect
    // penuh (bukan router push) sengaja dipakai di sini.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?from=${encodeURIComponent(from)}`;
  }
  return res;
}

export function csrfFetch(input, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = init.headers ? new Headers(init.headers) : new Headers();
  if (STATE_METHODS.includes(method)) {
    const token = getCsrfToken();
    if (token && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
  }
  return fetch(input, { ...init, headers }).then(redirectIfUnauthed);
}

// Fetch polos yang juga mengarahkan ke /login saat sesi kedaluwarsa.
// Dipakai polling GET di halaman-halaman dashboard.
export function authedFetch(input, init = {}) {
  return fetch(input, init).then(redirectIfUnauthed);
}

// Parse JSON dengan aman: bila server mengembalikan non-JSON (mis. halaman
// error HTML "<!DOCTYPE ..."), tampilkan pesan yang jelas alih-alih
// "Unexpected token '<' ... is not valid JSON" yang membingungkan.
export async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Respons server tidak valid (HTTP ${res.status}). Muat ulang halaman atau coba lagi.`);
  }
  return res.json();
}

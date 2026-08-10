// Client-side CSRF (double-submit cookie) untuk API dashboard.
// Membungkus fetch() agar otomatis menambahkan header X-CSRF-Token
// (dibaca dari cookie dev_csrf) pada metode state-changing, dan
// mengarahkan ke /login bila sesi kedaluwarsa (401).
//
// Sekaligus mengirim identitas perangkat stabil (X-Device-Id) pada
// SETIAP request. Server tidak bisa melihat MAC fisik lewat HTTPS —
// ID ini adalah fingerprint perangkat (localStorage) yang dipakai
// untuk memblokir perangkat mencurigakan secara real-time.
// Hanya boleh diimpor dari komponen client.

export const CSRF_COOKIE = 'dev_csrf';
export const DEVICE_STORAGE_KEY = 'eluzai_dev_device_id';

export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// ID perangkat stabil: dibuat sekali, disimpan di localStorage, diingat
// dalam memori proses agar tidak baca ulang di tiap request.
export function getDeviceId() {
  if (typeof window === 'undefined') return '';
  if (window.__eluzaiDevDeviceId) return window.__eluzaiDevDeviceId;
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_STORAGE_KEY) || '';
  } catch {
    id = '';
  }
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    } catch {
      // Storage tidak tersedia — ID tetap dipakai untuk sesi ini.
    }
  }
  window.__eluzaiDevDeviceId = id;
  return id;
}

const STATE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Header identitas perangkat — dipasang di SEMUA request (GET maupun
// state-changing) agar proxy/login bisa memblokir perangkat.
function withDeviceHeader(headers) {
  const deviceId = getDeviceId();
  if (deviceId && !headers.has('X-Device-Id')) headers.set('X-Device-Id', deviceId);
  return headers;
}

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
  withDeviceHeader(headers);
  if (STATE_METHODS.includes(method)) {
    const token = getCsrfToken();
    if (token && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
  }
  return fetch(input, { ...init, headers }).then(redirectIfUnauthed);
}

// Fetch polos yang juga mengarahkan ke /login saat sesi kedaluwarsa.
// Dipakai polling GET di halaman-halaman dashboard.
export function authedFetch(input, init = {}) {
  const headers = init.headers ? new Headers(init.headers) : new Headers();
  withDeviceHeader(headers);
  return fetch(input, { ...init, headers }).then(redirectIfUnauthed);
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

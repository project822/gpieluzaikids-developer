# 🔐 Keamanan GPI Eluzai — Implementasi di Project Next.js

Dokumen ini mendokumentasikan **semua lapisan keamanan** yang diterapkan di project ini
beserta lokasi file-nya. Project ini dibangun dengan **Next.js 16 (App Router) + React 19 +
MongoDB (Mongoose)**, sehingga beberapa teknik di sini adalah adaptasi dari pola
Express.js klasik ke arsitektur serverless Next.js.

---

## 📋 Ringkasan Lapisan

| # | Fitur | Melindungi dari | Lokasi di project ini |
|---|-------|-----------------|----------------------|
| 1 | Security Headers (CSP, HSTS, dll.) | XSS, clickjacking, MIME sniffing, dll. | `next.config.mjs` → `headers()` |
| 2 | HTTPS / HSTS | HTTP downgrade / traffic plaintext | `next.config.mjs` (HSTS produksi; redirect HTTPS otomatis oleh hosting/Vercel) |
| 3 | Origin/CORS Whitelist | Akses API dari domain asing | `proxy.js` (cek header `Origin`) |
| 4 | Input Sanitization | Stored XSS via form input | `lib/sanitize.js` + semua route POST/PUT |
| 5 | Body Size Limit | DoS via body besar | `proxy.js` (cek `Content-Length`, 100kb umum / 8MB untuk upload) |
| 6 | Auto-escaping render | XSS pada rendering | React (default escape) — tidak ada `dangerouslySetInnerHTML` |
| 7 | Cookie Aman (httpOnly, secure, sameSite) | Session hijacking | `lib/auth.js` → `tokenCookieOptions()` |
| 8 | CSRF Protection (double-submit cookie) | CSRF pada API/state-changing | `proxy.js` + `lib/security.js` + `lib/csrfClient.js` |
| 9 | Rate Limiting Login | Brute-force login | `lib/rateLimit.js` + `/api/auth/login` |
| 10 | Password Hashing (scrypt) | Password bocor plaintext | `lib/auth.js` (env `ADMIN_PASSWORD_HASH`) |
| 11 | Auth Middleware & Multi-user | Akses halaman terproteksi; login multi-user (DB) + /api/dev | `proxy.js` (halaman) + `lib/auth.js` + `lib/models/User.js` + `app/api/dev/users` |
| 12 | Maintenance Mode & Blocked IP | Kontrol akses darurat | `proxy.js` (env `MAINTENANCE_MODE`, `BLOCKED_IPS`) |
| 13 | Security Logging | Deteksi serangan (audit trail) | `lib/securityLog.js` + dashboard admin |
| 14 | File Upload Validation | Upload berbahaya (mime/ukuran) | `lib/sanitize.js` `isValidImage` + validasi sisi klien |
| 15 | Cache-Control Header | Cache poisoning / data basi | `next.config.mjs` (`/api/*` → `no-store`) |
| 16 | Trust Proxy / IP asli | IP asli di belakang proxy | `lib/security.js` `getClientIp` (`x-forwarded-for`) |

---

## 🔑 Environment Variables

```bash
# Wajib di produksi
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti-password-ini        # ATAU lebih aman:
ADMIN_PASSWORD_HASH=scrypt$<salt>$<hash> # hash scrypt — generate:
#   node -e "require('./lib/auth.js').hashPassword('passwordku').then(console.log)"
ADMIN_SECRET=<random-string-min-32-karakter>
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Opsional — kontrol akses darurat (dibaca proxy.js di Edge)
MAINTENANCE_MODE=1                       # aktifkan mode maintenance (halaman publik → 503)
BLOCKED_IPS=1.2.3.4,5.6.7.8              # blokir IP tertentu (→ 403)

# Opsional — database (nama db wajib eksplisit, mis. /Database — bukan 'test')
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/Database

# Opsional — integrasi project /dev (buat user admin via /api/dev/users)
DEV_API_KEY=<random-string>
```

> ⚠️ Di Vercel: set semua env var di **Settings → Environment Variables**,
> bukan hanya di `.env.local`.

---

## 🛡️ Detail Implementasi per Fitur

### 1. Security Headers (CSP, HSTS, Clickjacking, dll.)
**File:** `next.config.mjs` → `async headers()`.

Berlaku untuk semua rute:
```js
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...; frame-src https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   // produksi saja
```

Catatan CSP:
- `'unsafe-inline'` di `script-src`/`style-src` diperlukan karena Next.js
  menyuntikkan skrip bootstrap & ada skrip tema inline (`app/layout.js`).
  `'unsafe-eval'` hanya untuk mode dev (webpack HMR).
- `frame-src https://www.google.com` mengizinkan embed Google Maps di
  `components/sections/LocationSection.jsx`.

### 2. HTTPS & HSTS
- **Redirect HTTPS:** ditangani otomatis oleh platform hosting (Vercel).
- **HSTS:** dikirim hanya di produksi via `next.config.mjs` (`preload`).

### 3. Origin/CORS Whitelist
**File:** `proxy.js`. Untuk semua request state-changing (POST/PUT/PATCH/DELETE)
ke `/api/*`, jika header `Origin` ada dan host-nya berbeda dari host situs →
ditolak `403`. Ini mencegah pemanggilan API dari situs lain (CSRF tingkat lanjut).

### 4. Input Sanitization (anti Stored XSS)
**File:** `lib/sanitize.js` — `sanitizePayload()` membuang semua tag HTML
(`/<[^>]*>/g`) dari seluruh field string secara rekursif.

Dipasang di semua route POST/PUT: `app/api/events`, `app/api/events/[id]`,
`app/api/banners`, `app/api/banners/[id]`, `app/api/schedules`,
`app/api/schedules/[id]`. Lapisan kedua: React auto-escape.

### 5. Body Size Limit (anti DoS)
**File:** `proxy.js`. Memeriksa header `Content-Length`:
- `/api/auth/login` → maks **100kb**
- `/api/events*` & `/api/banners*` → maks **8MB** (data-URL base64 gambar)
- lainnya → 100kb

### 6. Auto-escaping Render
React meng-escape semua output secara default. Tidak ada
`dangerouslySetInnerHTML` di project ini.

### 7. Cookie Aman (sesi JWT)
**File:** `lib/auth.js` → `tokenCookieOptions()`:
```js
{ httpOnly: true, sameSite: 'lax', secure: true /* produksi */, priority: 'high' }
```
Cookie sesi `eluzai_token` tidak bisa dibaca JavaScript (anti XSS cookie theft)
dan `SameSite=Lax` (anti CSRF via cookie).

### 8. CSRF Protection (double-submit cookie)
- **Server:** `proxy.js` memvalidasi setiap request state-changing ke `/api/*`
  (kecuali login): cookie `eluzai_csrf` harus sama dengan header `X-CSRF-Token`
  (perbandingan konstan-waktu, `lib/security.js`).
- **Cookie:** `eluzai_csrf` (bukan httpOnly, `SameSite=Lax`, Secure di produksi)
  dibuat otomatis di `proxy.js` bila belum ada.
- **Client:** `lib/csrfClient.js` → `csrfFetch()` otomatis menambahkan header
  `X-CSRF-Token` untuk semua metode state-changing. Dipakai oleh
  `ResourceManager.jsx`, `AdminLoginForm.jsx`, `LogoutButton.jsx`.

### 9. Rate Limiting Login (anti Brute-force)
**File:** `lib/rateLimit.js` + `/api/auth/login`.
- Melacak **3 dimensi** sekaligus: per IP, per username, per IP+username.
- Default: 5 percobaan / 15 menit → blokir 10 menit (`429` + `Retry-After`).
- Pembersihan memori otomatis tiap 30 menit (anti memory leak).
- Catatan serverless: store in-memory per instance — tetap efektif melawan
  serangan brute-force satu sumber.

### 10. Password Hashing (scrypt)
**File:** `lib/auth.js`.
- `ADMIN_PASSWORD_HASH` (format `scrypt$<salt>$<hash>`) diverifikasi dengan
  **scrypt** (KDF modern, built-in Node, tanpa dependensi baru) + perbandingan
  konstan-waktu.
- Jika hash belum diset, fallback ke `ADMIN_PASSWORD` dengan perbandingan
  konstan-waktu (`safeCompare`, SHA-256).
- Generate hash: `node -e "require('./lib/auth.js').hashPassword('passwordku').then(console.log)"`

### 11. Auth Middleware & Multi-user Admin
- **Halaman /admin:** `proxy.js` — redirect ke `/admin/login` bila token JWT tidak valid.
- **API admin:** `lib/auth.js` `requireAdmin()` di setiap route POST/PUT/DELETE
  (role `admin` / `superadmin`).
- **Multi-user:** login memverifikasi **user database** (model `User`, password
  hash scrypt) terlebih dahulu, lalu fallback ke kredensial env
  (`ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH`) sebagai super-admin.
- **Project /dev:** `POST|GET /api/dev/users` (file `app/api/dev/users/route.js`)
  membuat/membaca user admin. Autentikasi memakai **kunci bersama** `DEV_API_KEY`
  (header `X-Dev-Key`) — endpoint ini **dikecualikan dari CSRF & origin check**
  di `proxy.js` karena pemanggilnya mesin-ke-mesin dengan kunci sendiri;
  tetap tunduk pada body limit & blocked IP. Tanpa `DEV_API_KEY` semua permintaan
  ditolak `401`.

### 12. Maintenance Mode & Blocked IP
**File:** `proxy.js` + `lib/security.js` (env-based, cocok untuk Edge/serverless).
```bash
MAINTENANCE_MODE=1        # halaman publik → 503; /admin & /api tetap jalan
BLOCKED_IPS=1.2.3.4,5.6.7.8  # IP terblokir → 403 di seluruh situs
```

### 13. Security Logging (audit trail)
**File:** `lib/securityLog.js`.
- `logSecurityEvent({ type, ip, path, userAgent, detail })` → console + buffer
  in-memory maks **500 entri** (tertua dibuang).
- Tipe: `blocked_ip` | `rate_limit` | `csrf` | `failed_login`.
- Statistik ditampilkan di dashboard `/admin` (kartu "Ringkasan Keamanan")
  via `getSecurityStats()`: event 24 jam, IP diblokir, rate limit, CSRF ditolak,
  login gagal.

### 14. File Upload Validation
- **Sisi klien** (`ResourceManager.jsx`): hanya PNG/JPG/WebP, maks 4MB,
  dipotong & dikompres ke WebP di browser.
- **Sisi server** (`lib/sanitize.js` `isValidImage`): data-URL dengan MIME
  whitelist (`png|jpe?g|webp|svg+xml`) dan batas ukuran (~7MB chars).

### 15. Cache-Control
- `/api/*` → `Cache-Control: no-store` (`next.config.mjs`) — data dinamis tidak
  boleh di-cache browser.
- Aset statis Next.js sudah memakai content-hash (`immutable` otomatis).

### 16. Trust Proxy / IP Asli
**File:** `lib/security.js` `getClientIp()` — membaca `x-forwarded-for`
(diisi platform serverless/Vercel) lalu `x-real-ip`. Dipakai oleh rate limiter
login dan blocked IP.

---

## ✅ Checklist Verifikasi

```bash
# 1. Security headers terpasang
curl -sI http://localhost:22889 | grep -iE "content-security-policy|frame-options|content-type-options|referrer-policy"

# 2. CSRF: POST tanpa token harus ditolak (tanpa cookie eluzai_csrf)
curl -s -X POST http://localhost:22889/api/events -H "Content-Type: application/json" -d '{}'
# → 401 (belum login) atau 403 (token CSRF tidak valid)

# 3. Rate limit: login 6x cepat harus dapat 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:22889/api/auth/login \
    -H "Content-Type: application/json" -d '{"username":"x","password":"y"}'
done

# 4. Origin asing ditolak
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:22889/api/events \
  -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{}'
# → 403

# 5. Maintenance mode
MAINTENANCE_MODE=1 npm run dev   # halaman publik → 503, /admin tetap bisa login
```

---

## ⚡ Optimasi Performa (praktik terbaik untuk halaman publik)

- **Gambar lewat `/img/[id]`** — data-URL base64 tidak lagi dirender inline di
  HTML publik. `app/img/[id]/route.js` menyajikan gambar sebagai biner dengan
  `Cache-Control: public, max-age=31536000, immutable` + cache-buster `?v=<updatedAt>`
  (URL berubah saat admin mengganti gambar → browser tidak menyajikan cache lama).
- **ISR 60 detik** — halaman `/`, `/events`, `/event/[id]` memakai
  `export const revalidate = 60` (halaman `/event/[id]` juga `generateStaticParams`),
  jadi tidak dirender ulang di tiap kunjungan; perubahan dari admin tampil ≤ 60 detik.
- **Proxy ringan** — verifikasi JWT hanya untuk rute `/admin`; cookie CSRF hanya
  untuk `/admin` & `/api`. `/img` dilewati proxy sepenuhnya (jalur tercepat).
- **RSC payload kecil** — `publicEvent()` (lib/format.js) membuang field `image`
  sebelum data dikirim ke komponen client (mis. `EventArchive`), menggantinya
  dengan flag `hasImage` — HTML tetap ringan.
- **Cache gambar in-memory** — `lib/imageCache.js` menyimpan hasil decode base64
  (maks 200 entri), di-invalidasi otomatis saat admin meng-update/menghapus item.
- **Font di-trim** — Poppins hanya memuat weight 400/500/600/700 (yang dipakai),
  bukan 300/400/500/600/700/800. `poweredByHeader: false` di next.config.

---

## 📌 Rekomendasi Tambahan

- **Jangan commit `.env*`** — sudah di `.gitignore`.
- **Rotasi `ADMIN_SECRET`** dan password admin secara berkala.
- **Update dependensi** secara rutin (`npm audit`).
- **Vercel**: aktifkan firewall & deployment protection di project settings.
- **2FA** untuk login admin (belum diterapkan — disarankan untuk produksi).

---

---

## 🔐 Dev Console (project `D:\church-dev`) — Implementasi Keamanan

Dashboard developer ini menerapkan pola keamanan yang sama (adaptasi untuk
arsitektur proxy server-to-server). Semua lapisan berikut berada di project
`D:\church-dev` dan berjalan di port **22890**.

| Fitur | Lokasi | Catatan |
| --- | --- | --- |
| Security Headers (CSP, HSTS produksi, dll.) | `next.config.mjs` → `headers()` | `frame-ancestors 'none'`, `object-src 'none'`; origin website utama diizinkan di `style-src`/`img-src` agar preview iframe tetap jalan |
| Cache-Control `no-store` untuk `/api/*` | `next.config.mjs` | Data API tidak boleh di-cache |
| Origin Whitelist (state-changing) | `proxy.js` | Header `Origin` dengan host ≠ dashboard → `403` |
| Body Size Limit | `proxy.js` | `Content-Length` > 100kb → `413` |
| CSRF double-submit cookie | `proxy.js` + `lib/csrfServer.js` + `lib/csrfClient.js` | Cookie `dev_csrf` ↔ header `X-CSRF-Token` (perbandingan konstan-waktu) |
| Rate Limiting Login | `lib/rateLimit.js` + `/api/auth/login` | 3 dimensi (IP, username, IP+username); 5 gagal/15 menit → blokir 10 menit (`429` + `Retry-After`) |
| Cookie Aman (sesi JWT) | `lib/auth.js` → `tokenCookieOptions()` | `httpOnly`, `sameSite=lax`, `secure` di produksi |
| Secret Guard Produksi | `lib/auth.js` → `getSecret()`/`issueToken()`/`dashboardCredentials()` | Tanpa `DASHBOARD_SECRET`/kredensial di produksi → token tidak bisa diterbitkan/diverifikasi |
| Audit Trail | `lib/securityLog.js` | `failed_login`, `rate_limit`, `csrf`, `origin`, `body_limit`, `auth` → console + buffer 500 entri |
| Kunci `X-Dev-Key` server-only | `lib/siteApi.js` + `app/api/dev/[...path]/route.js` | Kunci hanya hidup di server dashboard, tidak pernah terlihat browser |
| Respons JSON selalu | `app/api/dev/[...path]/route.js` + `lib/csrfClient.js` `safeJson()` | Bila website utama mengembalikan HTML error, client tetap mendapat pesan JSON yang jelas (bukan error parse JSON) |

Catatan CSP dashboard:
- `script-src 'self' 'unsafe-inline'` (skrip tema inline + bootstrap Next.js);
  `'unsafe-eval'` hanya di mode dev (HMR).
- Jika `SITE_BASE_URL` diubah, sesuaikan juga daftar origin di
  `next.config.mjs` (`style-src`/`img-src`/`font-src`) agar preview iframe tetap berfungsi.
- Dependensi export `xlsx@0.18.5` punya advisory publik (CVE-2023-30533, ReDoS saat
  parse file tak tepercaya) — aman di sini karena dipakai **hanya untuk menulis** file
  export (tidak pernah mem-parsing input pengguna).

---

*Dokumen disusun berdasarkan implementasi aktual di project GPI Eluzai (Next.js 16)*
*dan Dev Console (`D:\church-dev`).*

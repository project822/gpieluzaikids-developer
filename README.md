# 🛠️ Eluzai Dev Console — Dashboard Developer

Dashboard **milik developer (single user)** untuk mengelola **website utama GPI Eluzai**
(project `D:\church`, port `22889`). Project ini **terpisah** dari website utama dan
berjalan di port **22890**.

## 🚀 Menjalankan

Pastikan **website utama sudah berjalan** di `http://localhost:22889` (folder `D:\church`):

```bash
cd D:\church && npm run dev        # terminal 1 — website utama (22889)
cd D:\church-dev && npm run dev    # terminal 2 — dashboard ini (22890)
```

Buka **http://localhost:22890** lalu login dengan kredensial di `.env.local`.

## ⚙️ Konfigurasi (`.env.local`)

| Variabel | Keterangan |
| --- | --- |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Kredensial login dashboard (single user) |
| `DASHBOARD_SECRET` | Secret JWT sesi dashboard — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SITE_BASE_URL` | URL website utama — **produksi: `https://gpieluzaikids.vercel.app`**, dev lokal: `http://localhost:22889` |
| `DEV_API_KEY` | **WAJIB sama** dengan `DEV_API_KEY` di `.env.local` website utama — kunci ini dipakai dashboard memanggil `/api/dev/*` website utama (dikirim server-side, tidak pernah terlihat browser) |
| `NEXT_PUBLIC_SITE_URL` | URL website utama untuk tautan & preview di sisi client (harus sama dengan `SITE_BASE_URL`; di-inline saat build) |
| `MONGODB_URI` | (opsional untuk sekarang) Connection string MongoDB Atlas — salin dari **Database → Connect → Drivers**. Koneksi dicek via `GET /api/db/health` |
| `MONGODB_DB` | (opsional) Nama database, default `eluzai-dashboard` |
| `BLOCKED_IPS` | (opsional) Daftar IP yang diblokir, dipisah koma — `1.2.3.4,5.6.7.8` → semua permintaan dari IP itu ditolak `403` (diterapkan di `proxy.js`) |
| `DNS_SERVERS` | (opsional) Paksa DNS server untuk koneksi MongoDB, format `"8.8.8.8,1.1.1.1"` — berguna bila fix DNS otomatis tidak cocok di jaringanmu |

## 🍃 MongoDB

Dashboard sudah siap terhubung ke **MongoDB Atlas** (driver native `mongodb`,
minimal dependency). Infrastruktur: `lib/mongodb.js` (koneksi ter-cache — aman
untuk dev HMR & produksi) dan endpoint verifikasi `GET /api/db/health`
(dilindungi sesi).

Cara pakai di route handler:

```js
import { getDb } from '@/lib/mongodb';

const db = await getDb();
const coll = db.collection('nama-koleksi');
```

1. Buat cluster gratis di [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Salin connection string (username/password cluster) ke `MONGODB_URI` di `.env.local`.
3. Restart dev server, lalu buka `http://localhost:22890/api/db/health` untuk verifikasi.

## 🛡️ Modul keamanan & model (paritas dengan D:\church)

Struktur folder ini diselaraskan dengan website utama (D:\church). Modul berikut
**di-port/adaptasi** dari D:\church — semua di sisi server, tanpa secret:

| Modul | Fungsi |
| --- | --- |
| `lib/sanitize.js` | Anti stored XSS (`sanitizePayload`) + validasi data-URL gambar |
| `lib/security.js` | `getClientIp` (trust proxy) + `isIpBlocked` (env `BLOCKED_IPS`) — dipakai `proxy.js` |
| `lib/db.js` | Koneksi **Mongoose** singleton (aman serverless) + fix DNS self-healing; gunakan bersama `database/models/` |
| `lib/token.js` | Re-export dari `lib/auth.js` (paritas API dengan website utama) |
| `lib/attendanceValidation.js` | Konstanta & validator absensi (dipakai model `Attendance`/`ClassMember`) |
| `database/models/` | 7 model Mongoose: `User`, `ActivityLog`, `Attendance`, `ClassMember`, `EventItem`, `Banner`, `Schedule` |

Contoh pemakaian model:

```js
import { connectToDatabase } from '@/lib/db';
import User from '@/database/models/User';

await connectToDatabase();
const users = await User.find({ active: true }).lean();
```

Catatan: `lib/mongodb.js` (driver native) tetap dipakai endpoint `/api/db/health`;
`lib/db.js` (Mongoose) adalah lapisan tambahan untuk fitur penyimpanan ke depan.

## 🚀 Deployment (Vercel)

Dashboard ini **bisa di-deploy ke Vercel**. Website utama sudah live di
`https://gpieluzaikids.vercel.app` — dashboard terhubung ke sana lewat
`SITE_BASE_URL` / `NEXT_PUBLIC_SITE_URL`.

Set **semua** env var berikut di Vercel → **Settings → Environment Variables**
(jangan di-commit lewat `.env*` — sudah di-`.gitignore`):

| Variabel | Keterangan |
| --- | --- |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Kredensial login dashboard |
| `DASHBOARD_SECRET` | Secret JWT sesi (wajib, bukan default — lihat guard produksi di `lib/auth.js`) |
| `SITE_BASE_URL` | `https://gpieluzaikids.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://gpieluzaikids.vercel.app` (sama dengan `SITE_BASE_URL`) |
| `DEV_API_KEY` | **Harus sama persis** dengan `DEV_API_KEY` yang diset di **Vercel project website utama** — kunci server-to-server ke `/api/dev/*` |
| `MONGODB_URI` / `MONGODB_DB` | Koneksi MongoDB Atlas |

> ⚠️ **DEV_API_KEY harus cocok di kedua project**: website utama (Vercel) dan
> dashboard. Jika key di produksi website utama berbeda/kosong, dashboard akan
> mendapat error `Kunci X-Dev-Key tidak valid atau belum dikonfigurasi` dari
> semua `/api/dev/*`.

## 📄 Halaman

- **Dashboard** — kartu status website utama (Active/Disconnected), status database,
  toggle maintenance mode, dan daftar **IP yang sedang diblokir rate limit** real-time + tombol unblock.
- **System** — kontrol maintenance mode lengkap + **preview website utama** (jika
  maintenance aktif, preview menampilkan halaman 503 persis).
- **Account** — tambah admin, reset password, aktif/nonaktif, hapus (dengan perlindungan
  "jangan hapus admin aktif terakhir"), dan status **login terakhir** (waktu + IP).
- **Security** — kartu **lapisan keamanan terpasang** di website utama (status Active/Disconnected),
  IP terblokir rate-limit real-time, dan blocklist manual (dengan label `env` untuk IP dari
  `BLOCKED_IPS` yang hanya bisa dihapus lewat `.env.local`).
- **Absensi** — arsip **1 tahun kalender (Januari–Desember)**, klik bulan → **detail hari/tanggal
  per sesi** (seperti Riwayat Absensi di admin) + lihat **nama anak per sesi** + hapus per sesi,
  hapus semua data (setelah ada data tahun sebelumnya), dan **export per bulan ke Excel (.xlsx)
  dan PDF** dengan judul `Rekap Kehadiran #bulan #tahun`.
- **Aktivitas** — log semua tindakan admin website utama dengan filter modul & pencarian,
  plus tombol **Hapus Semua Log** (konfirmasi `HAPUS`) yang menghapus seluruh log dari database.

Semua halaman polling otomatis (5–10 detik) sehingga status & IP terblokir selalu mutakhir.

## 🔐 Keamanan

- Login dashboard **mandiri** (JWT cookie `httpOnly`), terpisah dari akun admin gereja.
- Di produksi, `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, dan `DASHBOARD_SECRET`
  **wajib diisi** (nilai default ditolak).
- `X-Dev-Key` hanya hidup di server dashboard — client hanya bicara ke
  `/api/dev/*` dashboard yang mem-forward-nya.
- API dashboard dilindungi sesi + **CSRF double-submit** (`dev_csrf` ↔ `X-CSRF-Token`).
- **Security headers** (CSP, HSTS produksi), **origin whitelist**, **body size limit**, dan
  **rate limiting login** (5 gagal/15 menit → blokir 10 menit) — lihat `SECURITY.md`
  bagian "Dev Console" untuk detailnya.

## 🗂️ Endpoint /api/dev/* di website utama (yang dipakai dashboard)

Ditambahkan di project `D:\church` (semuanya butuh `X-Dev-Key`):

| Endpoint | Metode | Fungsi |
| --- | --- | --- |
| `/api/dev/status` | GET | Status app, DB, maintenance, IP rate-limit & blocklist, statistik keamanan |
| `/api/dev/security` | GET | Daftar lapisan keamanan + status |
| `/api/dev/users` | GET/POST | Daftar / buat user admin |
| `/api/dev/users/:id` | PATCH/DELETE | Reset password, ubah role/active, hapus |
| `/api/dev/ip-ratelimit` | GET/DELETE | IP yang sedang kena rate limit + unblock |
| `/api/dev/system/maintenance` | GET/POST | Status & toggle maintenance (real-time, tanpa restart) |
| `/api/dev/system/blocked` | GET/POST/DELETE | Kelola blocklist runtime |

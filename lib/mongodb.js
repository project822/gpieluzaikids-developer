// Koneksi MongoDB untuk dashboard (pola resmi Next.js + MongoDB).
// - Development: promise koneksi disimpan di globalThis agar HMR Next.js
//   (yang mengeksekusi ulang modul ini berkali-kali) tidak membuat koneksi
//   baru terus-menerus → mencegah connection leak.
// - Produksi: satu promise koneksi per instance server.
// - PENTING: file ini HANYA boleh dipakai di server (route handler). Jangan
//   pernah diimpor dari komponen client — MONGODB_URI tidak boleh bocor
//   ke browser.
import { MongoClient } from 'mongodb';
import { applyDnsFix } from '@/lib/dnsFix';

// Fix DNS self-healing (bug c-ares di Windows, lihat lib/dnsFix.js) —
// dipakai bersama dengan lib/db.js agar implementasi tidak terduplikasi.
applyDnsFix();

const uri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DB || 'eluzai-dashboard';

// Timeout singkat (5 detik): kegagalan koneksi (URI salah, cluster offline)
// segera dilaporkan alih-alih menggantung permintaan.
const options = {
  serverSelectionTimeoutMS: 5000,
  appName: 'eluzai-dev-dashboard',
};

function createConnection() {
  if (!uri) {
    // Tidak dilempar saat import — hanya saat dipakai. Dengan begitu route
    // lain tetap berfungsi meski MONGODB_URI belum diisi, dan health check
    // bisa memberi pesan yang jelas. Promise ditandai handled agar tidak
    // memicu peringatan unhandledRejection di console.
    const error = new Error(
      'MONGODB_URI belum diisi. Development: isi di .env.local. Produksi (Vercel): Settings → Environment Variables, lalu redeploy. Salin connection string dari MongoDB Atlas: Database > Connect > Drivers.'
    );
    const rejected = Promise.reject(error);
    rejected.catch(() => {});
    return rejected;
  }
  const promise = new MongoClient(uri, options).connect();
  // Tandai rejection sebagai handled (anti peringatan unhandledRejection di
  // console sebelum route handler menangkapnya) sekaligus catat ke console
  // agar kegagalan koneksi (cluster offline, kredensial salah) mudah dilacak.
  promise.catch((error) => {
    console.error('[mongodb] Gagal membuat koneksi:', error?.message || error);
    if (process.env.NODE_ENV === 'development') {
      // Kegagalan koneksi (mis. cluster sempat offline) — buang cache agar
      // permintaan berikutnya mencoba koneksi baru tanpa perlu restart.
      globalThis._eluzaiMongoUri = null;
      globalThis._eluzaiMongoClientPromise = null;
    }
  });
  return promise;
}

// Produksi: satu koneksi per instance server, dibuat saat module dimuat.
const prodClientPromise =
  process.env.NODE_ENV === 'development' ? null : createConnection();

// Dev: promise disimpan di globalThis dengan penanda URI yang sedang aktif.
// Jika URI berubah (mis. MONGODB_URI diisi setelah server jalan) atau cache
// dibuang (koneksi gagal), dibuat koneksi baru tanpa perlu restart server.
function getClientPromise() {
  if (process.env.NODE_ENV === 'development') {
    const cachedUri = globalThis._eluzaiMongoUri;
    if (cachedUri !== uri || !globalThis._eluzaiMongoClientPromise) {
      globalThis._eluzaiMongoUri = uri;
      globalThis._eluzaiMongoClientPromise = createConnection();
    }
    return globalThis._eluzaiMongoClientPromise;
  }
  return prodClientPromise;
}

// Ambil client MongoDB (sudah terkoneksi) — untuk ping/health check.
export async function getClient() {
  return getClientPromise();
}

export { dbName };
export default getClientPromise();

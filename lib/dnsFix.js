// ============================================================
// Fix DNS self-healing — dipakai bersama oleh lib/mongodb.js
// (driver native) dan lib/db.js (Mongoose). Pola sama dengan
// website utama (D:\church/lib/db.js).
//
// Pada sebagian mesin (umumnya Windows), resolver c-ares Node
// terbaca sebagai 127.0.0.1 padahal tidak ada layanan DNS lokal
// di sana → semua kueri DNS (termasuk SRV/TXT MongoDB Atlas)
// gagal dengan ECONNREFUSED. Deteksi kondisi ini dan arahkan
// ulang ke DNS publik HANYA bila semua server terkonfigurasi
// berupa loopback — di mesin sehat fungsi ini tidak mengubah
// apa pun. Bisa dipaksa lewat env DNS_SERVERS (format:
// "8.8.8.8,1.1.1.1").
//
// PENTING: dipanggil ulang di connectToDatabase() karena state
// resolver DNS Node bersifat per-konteks eksekusi (worker thread
// pada Next.js) — harus diset di konteks yang sama dengan
// mongoose.connect() / MongoClient.connect(). Set server DNS pada
// SEMUA resolver (callback & promises) — keduanya objek terpisah
// pada runtime Next.js; driver MongoDB memakai resolver promises.
// ============================================================

import dns from 'node:dns';

function setDnsServers(list) {
  try {
    dns.setServers(list);
  } catch (error) {
    console.warn(`[eluzai] Gagal set DNS servers (${list.join(', ')}): ${error.message}`);
  }
  try {
    if (typeof dns.promises?.setServers === 'function') dns.promises.setServers(list);
  } catch (error) {
    console.warn(`[eluzai] Gagal set DNS servers promises (${list.join(', ')}): ${error.message}`);
  }
}

export function applyDnsFix() {
  if (typeof dns.setServers !== 'function') return;
  const override = (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (override.length > 0) {
    setDnsServers(override);
    return;
  }
  const servers = dns.getServers();
  const allLoopback =
    servers.length > 0 &&
    servers.every((s) => s === '::1' || s.startsWith('127.'));
  if (allLoopback) {
    setDnsServers(['8.8.8.8', '1.1.1.1']);
    // Flag global agar peringatan tidak berulang di tiap bundle/worker Next.js.
    if (!globalThis.__eluzaiDnsWarned) {
      globalThis.__eluzaiDnsWarned = true;
      console.warn(
        '[eluzai] DNS lokal (127.0.0.1) tidak tersedia — memakai 8.8.8.8 / 1.1.1.1. Set env DNS_SERVERS untuk mengubah.'
      );
    }
  }
}

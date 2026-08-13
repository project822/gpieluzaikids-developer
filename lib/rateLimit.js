// ============================================================
// Rate limiting login dashboard (anti brute-force) — pola sama
// dengan website utama (D:\church).
//
// Store: MongoDB bersama (collection `dev_rate_limits` pada
// MONGODB_URI/MONGODB_DB yang dikonfigurasi) — efektif lintas
// instance serverless (Vercel): semua instance membaca/menulis
// rekaman yang sama, jadi brute-force dari satu IP/user terlihat
// dan diblokir di SEMUA instance.
//
// Bila MongoDB tidak tersedia / belum dikonfigurasi, fall back ke
// Map in-memory (best-effort per instance — perilaku lama).
// Prinsip fail-open: rate limit TIDAK boleh memblokir login hanya
// karena database offline.
//
// Melacak 3 dimensi sekaligus: per IP, per username, per
// IP+username. Default: 5 percobaan gagal / 15 menit → blokir
// 10 menit (429 + Retry-After).
// ============================================================

import { getClient, dbName } from '@/lib/mongodb';

const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const BLOCK_MS = 10 * 60 * 1000; // 10 menit
const MAX_ATTEMPTS = 5;
const COLLECTION = 'dev_rate_limits';

// ---------- Store in-memory (fallback saat MongoDB offline) ----------
const memStore = new Map(); // key → { count, firstAt, blockedUntil }

// ---------- Helper ----------

// Tiga dimensi pelacakan per (ip, username). Field `ip`/`user` disimpan
// terpisah agar query berbasis field (mis. reset per-IP) tidak perlu
// mengurai string key.
function descriptorsFor(ip, username) {
  const u = String(username || '').toLowerCase().trim().slice(0, 64);
  return [
    { key: `ip:${ip}`, ip, user: '' },
    { key: `user:${u}`, ip: '', user: u },
    { key: `pair:${ip}|${u}`, ip, user: u },
  ];
}

// ---------- MongoDB (store utama) ----------

let indexReady = false;
let lastIndexAttempt = 0;
let lastMongoFail = 0;
let lastFallbackWarnedAt = 0;
const MONGO_FAIL_COOLDOWN_MS = 3000;
const INDEX_RETRY_MS = 30 * 1000; // jangan spam createIndex saat gagal transien

// Akses koleksi rate-limit bersama. Kembalikan null bila MongoDB tidak
// tersedia (fail-open → pemanggil memakai fallback memori). Cooldown
// singkat mencegah tiap percobaan login menunggu timeout koneksi saat
// database mati.
async function getColl() {
  const now = Date.now();
  if (lastMongoFail && now - lastMongoFail < MONGO_FAIL_COOLDOWN_MS) return null;
  try {
    const client = await getClient();
    const coll = client.db(dbName).collection(COLLECTION);
    if (!indexReady && now - lastIndexAttempt > INDEX_RETRY_MS) {
      lastIndexAttempt = now;
      try {
        // Unique key (anti duplikat upsert konkuren) + TTL otomatis untuk
        // rekaman basi (pembersih latar — semantic cleanup tetap di jalur baca).
        await coll.createIndex({ key: 1 }, { unique: true });
        await coll.createIndex(
          { updatedAt: 1 },
          { expireAfterSeconds: Math.ceil((WINDOW_MS + BLOCK_MS) / 1000) }
        );
        indexReady = true;
      } catch (error) {
        // Index sudah ada dengan opsi bertabrakan / hak akses terbatas →
        // nonaktifkan percobaan ulang (index tetap berfungsi). Kegagalan
        // lain (network) akan dicoba lagi di window berikutnya.
        if (error?.code === 85 || error?.codeName === 'IndexOptionsConflict') {
          indexReady = true;
        }
      }
    }
    lastMongoFail = 0;
    return coll;
  } catch {
    lastMongoFail = now;
    return null;
  }
}

// Catat fallback ke memori paling banyak sekali per 10 detik — supaya
// kegagalan DB yang berkepanjangan tidak spam log di tiap percobaan login.
function warnFallback(error) {
  const now = Date.now();
  if (now - lastFallbackWarnedAt > 10_000) {
    lastFallbackWarnedAt = now;
    console.warn('[rateLimit] MongoDB tidak tersedia — fallback memori:', error?.message || error);
  }
}

// ---------- API publik ----------

export async function checkRateLimit({ ip = 'unknown', username = '' } = {}) {
  const now = Date.now();
  const descriptors = descriptorsFor(ip, username);
  const coll = await getColl();

  if (coll) {
    try {
      for (const d of descriptors) {
        const rec = await coll.findOne({ key: d.key });
        if (!rec) continue;
        if (rec.blockedUntil && rec.blockedUntil > now) {
          const retryAfterSec = Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000));
          return { blocked: true, retryAfterSec, key: d.key };
        }
        // Blokir selesai / jendela 15 menit lewat → rekaman basi, mulai dari
        // nol. Guard pada filter mencegah menghapus rekaman yang baru saja
        // di-update request konkuren (race kecil yang self-healing).
        if (rec.blockedUntil && rec.blockedUntil <= now) {
          await coll.deleteOne({ key: d.key, blockedUntil: { $lte: now } });
          continue;
        }
        if (now - rec.firstAt > WINDOW_MS) {
          await coll.deleteOne({ key: d.key, firstAt: { $lte: now - WINDOW_MS } });
        }
      }
      return { blocked: false };
    } catch (error) {
      // DB error di tengah baca → fallback memori (fail-open).
      warnFallback(error);
    }
  }

  return checkRateLimitMem(descriptors, now);
}

export async function registerFailure({ ip = 'unknown', username = '', deviceId = '' } = {}) {
  const now = Date.now();
  const descriptors = descriptorsFor(ip, username);
  const coll = await getColl();
  // Rekam perangkat (fingerprint/"MAC") pelaku — supaya IP yang kena rate
  // limit bisa langsung diblokir juga perangkatnya (blocklist perangkat).
  const deviceSet = deviceId ? { $addToSet: { devices: deviceId } } : {};

  if (coll) {
    try {
      for (const d of descriptors) {
        let rec;
        try {
          rec = await coll.findOneAndUpdate(
            { key: d.key },
            {
              $inc: { count: 1 },
              $set: { key: d.key, ip: d.ip, user: d.user, updatedAt: now },
              $setOnInsert: { firstAt: now, blockedUntil: null },
              ...deviceSet,
            },
            { upsert: true, returnDocument: 'after' }
          );
        } catch (error) {
          // Upsert konkuren pada key baru: satu request menang insert, yang
          // lain kena duplicate key (E11000). Retry NON-upsert agar percobaan
          // ini tetap terhitung (jangan menjatuhkan hitungan diam-diam).
          if (error?.code !== 11000) throw error;
          rec = await coll.findOneAndUpdate(
            { key: d.key },
            {
              $inc: { count: 1 },
              $set: { key: d.key, ip: d.ip, user: d.user, updatedAt: now },
              ...deviceSet,
            },
            { returnDocument: 'after' }
          );
        }
        // Jaga array devices tetap ramping (defensif) — ID dari banyak percobaan
        // tidak boleh menumpuk tanpa batas.
        if (rec && Array.isArray(rec.devices) && rec.devices.length > 10) {
          await coll.updateOne(
            { key: d.key },
            { $set: { devices: rec.devices.slice(-10) } }
          );
        }
        // Saat batas tercapai, blokir ATOMIS (guard $eq: null) — hanya satu
        // request yang berhasil men-set blockedUntil.
        if (rec && rec.count >= MAX_ATTEMPTS && !rec.blockedUntil) {
          await coll.updateOne(
            { key: d.key, blockedUntil: null },
            { $set: { blockedUntil: now + BLOCK_MS, updatedAt: now } }
          );
        }
      }
      return;
    } catch (error) {
      // DB error di tengah tulis → fallback memori (fail-open).
      warnFallback(error);
    }
  }

  registerFailureMem(descriptors, now, deviceId);
}

export async function clearRateLimit({ ip = 'unknown', username = '' } = {}) {
  const descriptors = descriptorsFor(ip, username);
  const coll = await getColl();

  if (coll) {
    try {
      await coll.deleteMany({ key: { $in: descriptors.map((d) => d.key) } });
      // Bila hanya IP yang diberikan (reset akses per-IP), bersihkan juga
      // dimensi username yang terblokir bersama IP itu (pair:ip|user) —
      // supaya akses login benar-benar pulih untuk IP tersebut.
      if (ip && !username) {
        const users = await coll.distinct('user', { ip, user: { $ne: '' } });
        if (users.length > 0) await coll.deleteMany({ user: { $in: users } });
      }
      return;
    } catch (error) {
      // DB error → fallback memori.
      warnFallback(error);
    }
  }

  clearRateLimitMem(descriptors, ip, username);
}

export async function resetAllRateLimits() {
  const coll = await getColl();
  if (coll) {
    try {
      await coll.deleteMany({});
      return;
    } catch (error) {
      // DB error → fallback memori.
      warnFallback(error);
    }
  }
  memStore.clear();
}

// ---------- Fallback in-memory (perilaku lama) ----------

function pruneMem(now = Date.now()) {
  if (memStore.size < 2000) return;
  for (const [key, rec] of memStore) {
    const expired = !rec.blockedUntil && now - rec.firstAt > WINDOW_MS;
    const blockOver = rec.blockedUntil && rec.blockedUntil <= now;
    if (expired || blockOver) memStore.delete(key);
  }
}

function memGetRec(key, now) {
  const rec = memStore.get(key);
  if (!rec) return null;
  // Blokir selesai / jendela lewat → reset.
  if (rec.blockedUntil && rec.blockedUntil <= now) {
    memStore.delete(key);
    return null;
  }
  if (!rec.blockedUntil && now - rec.firstAt > WINDOW_MS) {
    memStore.delete(key);
    return null;
  }
  return rec;
}

function checkRateLimitMem(descriptors, now) {
  pruneMem(now);
  for (const d of descriptors) {
    const rec = memGetRec(d.key, now);
    if (rec?.blockedUntil) {
      const retryAfterSec = Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000));
      return { blocked: true, retryAfterSec, key: d.key };
    }
  }
  return { blocked: false };
}

function registerFailureMem(descriptors, now, deviceId) {
  pruneMem(now);
  let exceeded = false;
  const touched = [];
  for (const d of descriptors) {
    let rec = memGetRec(d.key, now);
    if (rec) {
      rec.count += 1;
      if (rec.count >= MAX_ATTEMPTS && !rec.blockedUntil) exceeded = true;
    } else {
      rec = { count: 1, firstAt: now, blockedUntil: null, devices: [] };
      memStore.set(d.key, rec);
    }
    if (deviceId && (rec.devices || []).length < 10 && !(rec.devices || []).includes(deviceId)) {
      if (!Array.isArray(rec.devices)) rec.devices = [];
      rec.devices.push(deviceId);
    }
    touched.push(rec);
  }
  // Bila salah satu dimensi melewati batas, blokir ketiganya sekaligus
  // (ip, user, pair) — selaras dengan website utama agar IP pelaku tampil
  // di daftar IP terblokir dan pergantian username tidak lolos.
  if (exceeded) {
    for (const rec of touched) {
      if (!rec.blockedUntil) rec.blockedUntil = now + BLOCK_MS;
    }
  }
}

function clearRateLimitMem(descriptors, ip, username) {
  for (const d of descriptors) memStore.delete(d.key);

  // Bila hanya IP yang diberikan (reset akses per-IP), bersihkan juga dimensi
  // username yang terblokir bersama IP itu (key pair:ip|user).
  if (ip && !username) {
    for (const key of [...memStore.keys()]) {
      if (key.startsWith(`pair:${ip}|`)) {
        const user = key.slice(`pair:${ip}|`.length);
        if (user) memStore.delete(`user:${user}`);
        memStore.delete(key);
      }
    }
  }
}

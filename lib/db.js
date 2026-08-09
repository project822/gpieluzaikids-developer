// Koneksi MongoDB (Mongoose) — pola singleton agar aman di serverless.
// Pola sama dengan website utama (D:\church/lib/db.js).
// Jika MONGODB_URI tidak diisi, aplikasi berjalan penuh dengan data demo.
//
// Catatan: dashboard juga punya lib/mongodb.js (driver native) yang dipakai
// endpoint /api/db/health. lib/db.js ini menyediakan lapisan Mongoose +
// model untuk fitur penyimpanan data dashboard ke depan (mis. persist
// security log / rate limit). Keduanya memakai MONGODB_URI yang sama.

import mongoose from 'mongoose';
import { applyDnsFix } from '@/lib/dnsFix';

const MONGODB_URI = process.env.MONGODB_URI;

// Fix DNS self-healing (lihat lib/dnsFix.js) — dipakai bersama dengan
// lib/mongodb.js agar implementasi tidak terduplikasi.
if (MONGODB_URI) {
  applyDnsFix();
}

const cached = globalThis._eluzaiMongo || { conn: null, promise: null };
globalThis._eluzaiMongo = cached;

export async function connectToDatabase() {
  if (!MONGODB_URI) return null;
  if (cached.conn) return cached.conn;

  // Pastikan resolver DNS konteks eksekusi ini sudah benar (lihat applyDnsFix).
  applyDnsFix();

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((mongooseInstance) => {
        console.log('[eluzai] Terhubung ke MongoDB (Mongoose)');
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
  return cached.conn;
}

// Lapisan akses data user admin untuk dashboard (project /dev).
//
// Berbeda dari jalur lama (proxy /api/dev/users ke website utama), repository
// ini menulis LANGSUNG ke database MongoDB yang sama dengan website utama
// (collection `users` pada MONGODB_URI/MONGODB_DB yang dikonfigurasi) — jadi
// user yang dibuat/ubah/dihapus di dashboard langsung berlaku di /admin
// website utama secara real time, tanpa bergantung pada website utama online
// atau kecocokan kunci DEV_API_KEY.
//
// Password di-hash scrypt (lib/auth.js) dengan format yang identik dengan
// website utama agar login website utama bisa memverifikasinya.

import { connectToDatabase } from '@/lib/db';
import User from '@/database/models/User';

// MongoDB tidak dikonfigurasi → beri pesan jelas, bukan mode demo diam-diam
// (mode demo justru membuat "real time" tidak tercapai).
async function requireDb() {
  const conn = await connectToDatabase();
  if (!conn) {
    throw new Error(
      'MONGODB_URI belum diisi. Development: isi di .env.local (gunakan connection string yang sama dengan website utama). Produksi (Vercel): Settings → Environment Variables, lalu redeploy.'
    );
  }
  return conn;
}

function serialize(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (obj._id) {
    obj.id = obj._id.toString();
    delete obj._id;
  }
  delete obj.__v;
  delete obj.passwordHash; // jangan pernah mengirim hash ke client
  return obj;
}

export async function listUsers() {
  await requireDb();
  const docs = await User.find().sort({ createdAt: 1 });
  return docs.map(serialize);
}

export async function findUserByUsername(username) {
  const uname = String(username || '').toLowerCase().trim();
  if (!uname) return null;
  await requireDb();
  return serialize(await User.findOne({ username: uname }));
}

export async function createUser(data) {
  await requireDb();
  return serialize(await User.create(data));
}

export async function updateUser(id, data) {
  await requireDb();
  return serialize(await User.findByIdAndUpdate(id, data, { new: true }));
}

export async function deleteUser(id) {
  await requireDb();
  await User.findByIdAndDelete(id);
  return true;
}

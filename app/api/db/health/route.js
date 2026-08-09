// Endpoint verifikasi koneksi MongoDB (dilindungi sesi oleh proxy.js).
// GET /api/db/health → { ok, configured, connected, db, latencyMs, error? }
import { NextResponse } from 'next/server';
import { getClient, dbName } from '@/lib/mongodb';

// Pesan error driver MongoDB bisa menyertakan connection string (termasuk
// kredensial, mis. MongoParseError saat URI salah format) — sembunyikan
// bagian URI sebelum pesan dikirim ke client.
function sanitizeError(error) {
  const raw = error?.message || 'Gagal terhubung ke MongoDB.';
  const uri = process.env.MONGODB_URI || '';
  return uri ? raw.split(uri).join('***') : raw;
}

export async function GET() {
  const start = Date.now();
  try {
    const client = await getClient();
    await client.db(dbName).command({ ping: 1 });
    return NextResponse.json({
      ok: true,
      configured: true,
      connected: true,
      db: dbName,
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    const configured = Boolean(process.env.MONGODB_URI);
    const message = sanitizeError(error);
    return NextResponse.json(
      {
        ok: false,
        configured,
        connected: false,
        db: dbName,
        latencyMs: Date.now() - start,
        error: configured
          ? `Gagal terhubung ke MongoDB: ${message}`
          : message,
      },
      // 500 = belum dikonfigurasi, 503 = gagal koneksi.
      { status: configured ? 503 : 500 }
    );
  }
}

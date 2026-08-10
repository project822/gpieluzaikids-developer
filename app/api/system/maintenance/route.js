// Kelola maintenance mode LANGSUNG ke MongoDB bersama website utama
// (pola sama dengan /api/users — lihat lib/maintenanceRepo.js).
//   GET  /api/system/maintenance → { ok, maintenance: { enabled, source, title, message, footer } }
//   POST /api/system/maintenance → ubah maintenance / teks (tulis ke MongoDB)
//
// Berbeda dari jalur proxy lama (/api/dev/system/maintenance → website
// utama): endpoint ini tidak bergantung pada website utama online atau
// kecocokan DEV_API_KEY. Website utama membaca state dari MongoDB yang
// sama, sehingga perubahan berlaku real-time (max ~1,5 detik antar-instance).
//
// Dilindungi sesi + CSRF oleh proxy.js (endpoint lokal dashboard).

import { NextResponse } from 'next/server';
import {
  getMaintenanceStatus,
  setMaintenanceMode,
  setMaintenanceText,
} from '@/lib/maintenanceRepo';
import { logSecurityEvent } from '@/lib/securityLog';
import { getClientIp } from '@/lib/security';

export async function GET() {
  try {
    const maintenance = await getMaintenanceStatus();
    return NextResponse.json({ ok: true, maintenance });
  } catch (error) {
    console.error('[api/system/maintenance GET]', error);
    return NextResponse.json({ error: error.message || 'Gagal membaca status maintenance.' }, { status: 503 });
  }
}

export async function POST(request) {
  const ip = getClientIp(request);
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa JSON object.' }, { status: 400 });
    }

    const changed = [];

    if (body.maintenance !== undefined) {
      if (typeof body.maintenance !== 'boolean') {
        return NextResponse.json({ error: '"maintenance" harus boolean.' }, { status: 400 });
      }
      await setMaintenanceMode(body.maintenance);
      changed.push(`mode ${body.maintenance ? 'DIAKTIFKAN' : 'dinonaktifkan'}`);
    }

    const textPatch = {};
    for (const key of ['title', 'message', 'footer']) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string') {
          return NextResponse.json({ error: `"${key}" harus string.` }, { status: 400 });
        }
        textPatch[key] = body[key];
      }
    }
    if (Object.keys(textPatch).length > 0) {
      await setMaintenanceText(textPatch);
      changed.push('teks diperbarui');
    }

    if (changed.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada field yang diubah (maintenance/title/message/footer).' },
        { status: 400 }
      );
    }

    logSecurityEvent({
      type: 'dev_api',
      ip,
      path: '/api/system/maintenance',
      detail: changed.join('; '),
    });

    return NextResponse.json({ ok: true, maintenance: await getMaintenanceStatus() });
  } catch (error) {
    console.error('[api/system/maintenance POST]', error);
    return NextResponse.json({ error: error.message || 'Gagal mengubah maintenance mode.' }, { status: 500 });
  }
}

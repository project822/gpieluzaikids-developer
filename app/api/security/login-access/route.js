import { NextResponse } from 'next/server';
import { clearRateLimit, resetAllRateLimits } from '@/lib/rateLimit';
import { logSecurityEvent } from '@/lib/securityLog';
import { getClientIp } from '@/lib/security';

// Reset akses login DASHBOARD (rate limit login milik dashboard ini).
//   DELETE /api/security/login-access?ip=1.2.3.4 → buka rate limit untuk satu IP
//   DELETE /api/security/login-access           → reset SEMUA rate limit login dashboard
//
// Dilindungi sesi + CSRF oleh proxy.js (bukan endpoint /api/dev — ini
// state dashboard, bukan mesin-ke-mesin).

export async function DELETE(request) {
  const ip = getClientIp(request);
  const target = String(request.nextUrl.searchParams.get('ip') || '').trim();

  if (target) {
    await clearRateLimit({ ip: target });
    logSecurityEvent({
      type: 'dev_api',
      ip,
      path: '/api/security/login-access',
      detail: `rate limit login dashboard dibuka untuk ${target}`,
    });
    return NextResponse.json({ ok: true, reset: 'ip', ip: target });
  }

  await resetAllRateLimits();
  logSecurityEvent({
    type: 'dev_api',
    ip,
    path: '/api/security/login-access',
    detail: 'semua rate limit login dashboard direset',
  });
  return NextResponse.json({ ok: true, reset: 'all' });
}

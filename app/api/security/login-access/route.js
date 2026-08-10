import { NextResponse } from 'next/server';
import { clearRateLimit, resetAllRateLimits } from '@/lib/rateLimit';
import { logSecurityEvent } from '@/lib/securityLog';

// Reset akses login DASHBOARD (rate limit login milik dashboard ini).
//   DELETE /api/security/login-access?ip=1.2.3.4 → buka rate limit untuk satu IP
//   DELETE /api/security/login-access           → reset SEMUA rate limit login dashboard
//
// Dilindungi sesi + CSRF oleh proxy.js (bukan endpoint /api/dev — ini
// state dashboard, bukan mesin-ke-mesin).

function getIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function DELETE(request) {
  const ip = getIp(request);
  const target = String(request.nextUrl.searchParams.get('ip') || '').trim();

  if (target) {
    clearRateLimit({ ip: target });
    logSecurityEvent({
      type: 'dev_api',
      ip,
      path: '/api/security/login-access',
      detail: `rate limit login dashboard dibuka untuk ${target}`,
    });
    return NextResponse.json({ ok: true, reset: 'ip', ip: target });
  }

  resetAllRateLimits();
  logSecurityEvent({
    type: 'dev_api',
    ip,
    path: '/api/security/login-access',
    detail: 'semua rate limit login dashboard direset',
  });
  return NextResponse.json({ ok: true, reset: 'all' });
}

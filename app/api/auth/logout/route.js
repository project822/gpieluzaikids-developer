import { NextResponse } from 'next/server';
import { TOKEN_COOKIE } from '@/lib/auth';
import { CSRF_COOKIE } from '@/lib/csrfServer';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(CSRF_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}

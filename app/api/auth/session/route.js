import { NextResponse } from 'next/server';
import { verifyToken, TOKEN_COOKIE } from '@/lib/auth';

export async function GET(request) {
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ authed: false }, { status: 401 });
  }
  return NextResponse.json({ authed: true, username: payload.sub, role: payload.role });
}

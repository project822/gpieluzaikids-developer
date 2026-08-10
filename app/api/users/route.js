// Kelola user admin dashboard LANGSUNG ke MongoDB bersama website utama.
//   GET  /api/users → daftar user
//   POST /api/users → buat user baru (hash scrypt)
// Dilindungi sesi dashboard oleh proxy.js (GET) + CSRF/Origin (POST).
import { NextResponse } from 'next/server';
import { listUsers, createUser, findUserByUsername } from '@/lib/userRepo';
import { hashPassword } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/securityLog';
import { getClientIp } from '@/lib/security';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt || null,
    lastLoginIp: u.lastLoginIp || '',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function GET(request) {
  const ip = getClientIp(request);
  try {
    const users = (await listUsers()).map(publicUser);
    return NextResponse.json({ data: users });
  } catch (error) {
    console.error('[api/users GET]', error);
    logSecurityEvent({ type: 'auth', ip, path: '/api/users', detail: 'Gagal memuat user database' });
    return NextResponse.json({ error: error.message || 'Gagal memuat user.' }, { status: 503 });
  }
}

export async function POST(request) {
  const ip = getClientIp(request);
  try {
    const body = await request.json();
    const username = String(body?.username || '').toLowerCase().trim();
    const password = String(body?.password || '');

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: 'Username 3–30 karakter (huruf, angka, titik, garis, underscore).' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 });
    }

    if (await findUserByUsername(username)) {
      return NextResponse.json({ error: 'Username sudah terdaftar.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      username,
      passwordHash,
      role: body?.role === 'superadmin' ? 'superadmin' : 'admin',
    });

    logSecurityEvent({ type: 'dev_api', ip, path: '/api/users', detail: `user dibuat: ${user.username}` });
    return NextResponse.json({ data: publicUser(user) }, { status: 201 });
  } catch (error) {
    console.error('[api/users POST]', error);
    logSecurityEvent({ type: 'auth', ip, path: '/api/users', detail: 'Gagal membuat user database' });
    return NextResponse.json({ error: error.message || 'Gagal membuat user.' }, { status: 503 });
  }
}

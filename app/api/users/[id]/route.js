// Kelola satu user admin (langsung ke MongoDB bersama website utama).
//   PATCH  /api/users/:id → reset password / ubah role / aktif-nonaktif
//   DELETE /api/users/:id → hapus user (cegah hapus admin aktif terakhir)
import { NextResponse } from 'next/server';
import { updateUser, deleteUser, listUsers } from '@/lib/userRepo';
import { hashPassword } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/securityLog';
import { getClientIp } from '@/lib/security';

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

export async function PATCH(request, { params }) {
  const ip = getClientIp(request);
  try {
    const { id } = await params;
    const body = await request.json();

    const patch = {};
    if (body?.password !== undefined && body.password !== '') {
      if (String(body.password).length < 6) {
        return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 });
      }
      patch.passwordHash = await hashPassword(String(body.password));
    }
    if (body?.role !== undefined) {
      if (!['admin', 'superadmin'].includes(body.role)) {
        return NextResponse.json({ error: 'Role harus admin atau superadmin.' }, { status: 400 });
      }
      patch.role = body.role;
    }
    if (body?.active !== undefined) {
      // Validasi ketat: jangan koersi (Boolean("false") === true — bug!).
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: '"active" harus boolean.' }, { status: 400 });
      }
      patch.active = body.active;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Tidak ada field yang diubah.' }, { status: 400 });
    }

    const user = await updateUser(id, patch);
    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    }

    logSecurityEvent({ type: 'dev_api', ip, path: `/api/users/${id}`, detail: `user diperbarui: ${user.username}` });
    return NextResponse.json({ data: publicUser(user) });
  } catch (error) {
    console.error('[api/users/:id PATCH]', error);
    return NextResponse.json({ error: error.message || 'Gagal memperbarui user.' }, { status: 503 });
  }
}

export async function DELETE(request, { params }) {
  const ip = getClientIp(request);
  try {
    const { id } = await params;

    // Cegah menghapus akun terakhir yang aktif (biar selalu ada admin).
    const users = await listUsers();
    const target = users.find((u) => u.id === id);
    if (!target) {
      return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    }
    const activeOthers = users.filter((u) => u.id !== id && u.active !== false).length;
    if (target.active !== false && activeOthers === 0) {
      return NextResponse.json(
        { error: 'Tidak bisa menghapus satu-satunya admin aktif.' },
        { status: 409 }
      );
    }

    await deleteUser(id);
    logSecurityEvent({ type: 'dev_api', ip, path: `/api/users/${id}`, detail: `user dihapus: ${target.username}` });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[api/users/:id DELETE]', error);
    return NextResponse.json({ error: error.message || 'Gagal menghapus user.' }, { status: 503 });
  }
}

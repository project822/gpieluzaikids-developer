'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import {
  Card,
  Spinner,
  StatusPill,
  EmptyState,
  Modal,
  usePolling,
  formatDateTime,
  timeAgo,
} from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

export default function AccountPage() {
  const { data, error, loading, refresh } = usePolling(async () => {
    const res = await authedFetch('/api/users');
    if (!res.ok) throw new Error('Gagal memuat user.');
    return safeJson(res);
  }, 10000);

  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Form tambah user — role selalu 'admin' (user & password saja).
  const [form, setForm] = useState({ username: '', password: '' });

  // Modal reset password
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Modal hapus
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  async function addUser(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await csrfFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal membuat user.');
      setForm({ username: '', password: '' });
      flash('success', `User "${json.data.username}" berhasil dibuat.`);
      refresh();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      const res = await csrfFetch(`/api/users/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal mereset password.');
      flash('success', `Password "${resetTarget.username}" berhasil direset.`);
      setResetTarget(null);
      setNewPassword('');
      refresh();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function toggleActive(user) {
    try {
      const res = await csrfFetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal mengubah status user.');
      flash('success', `User "${user.username}" kini ${json.data.active ? 'aktif' : 'nonaktif'}.`);
      refresh();
    } catch (err) {
      flash('error', err.message);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await csrfFetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus user.');
      flash('success', `User "${deleteTarget.username}" dihapus.`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      flash('error', err.message);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const users = data?.data || [];

  return (
    <div className="d-flex flex-column gap-4 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      <div className="row g-3">
        {/* Tambah user */}
        <div className="col-lg-4">
          <Card title="Tambah Admin" icon="plus">
            <form onSubmit={addUser} className="d-flex flex-column gap-3">
              <div>
                <label className="dev-label" htmlFor="u-username">Username</label>
                <input
                  id="u-username"
                  className="dev-input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="mis. gpieluzaikids_user"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_.\-]+"
                />
              </div>
              <div>
                <label className="dev-label" htmlFor="u-password">Password</label>
                {/* Password ditampilkan terbuka (show) supaya mudah diteliti sebelum disimpan. */}
                <input
                  id="u-password"
                  className="dev-input"
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="minimal 6 karakter"
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="btn-dev btn-dev-primary justify-content-center" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={17} />
                    Buat User
                  </>
                )}
              </button>
            </form>

          </Card>
        </div>

        {/* Daftar user */}
        <div className="col-lg-8">
          <Card
            title="Daftar Admin"
            sub={`${users.length} akun`}
            icon="users"
            actions={
              <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={refresh} title="Segarkan">
                <Icon name="refresh" size={15} />
                Segarkan
              </button>
            }
          >
            {loading && !data ? (
              <Spinner label="Memuat user..." />
            ) : error && !data ? (
              <EmptyState icon="alert" title="Gagal memuat user" sub={error} />
            ) : users.length === 0 ? (
              <EmptyState icon="users" title="Belum ada user database" sub="Buat admin pertama melalui form di samping." />
            ) : (
              <div className="table-responsive">
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Login Terakhir</th>
                      <th>Dibuat</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <span className="fw-semibold">{u.username}</span>
                        </td>
                        <td>
                          <StatusPill tone={u.role === 'superadmin' ? 'violet' : 'blue'}>
                            {u.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                          </StatusPill>
                        </td>
                        <td>
                          {u.active ? (
                            <StatusPill tone="green">Aktif</StatusPill>
                          ) : (
                            <StatusPill tone="red">Nonaktif</StatusPill>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.83rem' }}>
                            {u.lastLoginAt ? (
                              <>
                                <div className="fw-medium">{timeAgo(u.lastLoginAt)}</div>
                                <div className="text-muted-dev mono" style={{ fontSize: '0.76rem' }}>
                                  {formatDateTime(u.lastLoginAt)}
                                  {u.lastLoginIp ? ` · ${u.lastLoginIp}` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-dev" style={{ fontSize: '0.82rem' }}>belum pernah login</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="text-muted-dev" style={{ fontSize: '0.8rem' }}>{formatDateTime(u.createdAt)}</div>
                        </td>
                        <td>
                          <div className="d-flex gap-1 justify-content-end">
                            <button className="action-btn" title="Reset password" onClick={() => setResetTarget(u)}>
                              <Icon name="key" size={15} />
                            </button>
                            <button
                              className="action-btn"
                              title={u.active ? 'Nonaktifkan' : 'Aktifkan'}
                              onClick={() => toggleActive(u)}
                            >
                              <Icon name={u.active ? 'ban' : 'check'} size={15} />
                            </button>
                            <button className="action-btn danger" title="Hapus" onClick={() => setDeleteTarget(u)}>
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal reset password */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.username || ''}`}
        footer={
          <>
            <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setResetTarget(null)}>Batal</button>
            <button className="btn-dev btn-dev-primary btn-sm-dev" onClick={submitReset} disabled={resetBusy || newPassword.length < 6}>
              {resetBusy ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </>
        }
      >
        <form onSubmit={submitReset}>
          <label className="dev-label" htmlFor="reset-password">Password baru (minimal 6 karakter)</label>
          {/* Password ditampilkan terbuka (show) supaya mudah diteliti. */}
          <input
            id="reset-password"
            className="dev-input"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
            required
            minLength={6}
            placeholder="Password baru"
          />
        </form>
      </Modal>

      {/* Modal hapus */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Admin"
        footer={
          <>
            <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setDeleteTarget(null)}>Batal</button>
            <button className="btn-dev btn-dev-danger btn-sm-dev" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </>
        }
      >
        <div className="alert-dev alert-dev-danger mb-0">
          Yakin ingin menghapus user <strong>{deleteTarget?.username}</strong>? Tindakan ini tidak dapat dibatalkan.
          User yang sudah login tetap akan otomatis keluar saat sesinya berakhir.
        </div>
      </Modal>
    </div>
  );
}

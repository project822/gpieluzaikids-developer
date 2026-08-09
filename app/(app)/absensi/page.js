'use client';

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Icon from '@/components/Icon';
import { Card, StatCard, Spinner, EmptyState, Modal } from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

// Halaman & tombol hapus hanya bisa dijalankan setelah data absensi
// terakumulasi 1 tahun penuh — dicek di server (GET /api/dev/attendance/archive).

// Kelas Sekolah Minggu — sama dengan website utama.
const CLASSES = [
  { value: 'baby', label: 'Baby' },
  { value: 'samuel', label: 'Samuel' },
  { value: 'yosua', label: 'Yosua' },
  { value: 'musa', label: 'Musa' },
];

function classLabel(value) {
  return CLASSES.find((c) => c.value === value)?.label || value || '';
}

function monthLabel(key) {
  if (!key) return '';
  const d = new Date(`${key}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Label hari lengkap — persis seperti Riwayat Absensi di admin website utama:
// "Minggu, 9 Agustus 2026".
function formatSundayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function hadirCount(s) {
  return (s.entries || []).filter((e) => e.present).length;
}

export default function AbsensiPage() {
  const [archive, setArchive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Export per bulan
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [exporting, setExporting] = useState(''); // '' | 'excel' | 'pdf'

  // Detail per bulan (klik kartu bulan)
  const [detailMonth, setDetailMonth] = useState(null); // 'YYYY-MM' | null
  const [detail, setDetail] = useState(null); // sesi-sesi bulan terpilih
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Hapus satu sesi absensi
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [confirmSessionText, setConfirmSessionText] = useState('');

  // Detail nama anak per sesi
  const [nameView, setNameView] = useState(null);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/dev/attendance/archive', { cache: 'no-store' });
        const data = await safeJson(res);
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Gagal memuat arsip absensi.');
        setArchive(data.data || null);
        setError('');
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Penanda request detail — mencegah respons basi menimpa bulan yang baru
  // dipilih (klik cepat antar bulan).
  const detailReq = useRef(0);

  // Muat detail sesi satu bulan (hari/tanggal per kelas).
  async function openDetail(monthKey) {
    const req = ++detailReq.current;
    setDetailMonth(monthKey);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await authedFetch(`/api/dev/attendance?month=${encodeURIComponent(monthKey)}`, { cache: 'no-store' });
      const json = await safeJson(res);
      if (req !== detailReq.current) return; // respons basi — abaikan
      if (!res.ok) throw new Error(json.error || 'Gagal memuat detail absensi.');
      setDetail(json.data || []);
    } catch (e) {
      if (req !== detailReq.current) return;
      setDetailError(e.message);
    } finally {
      if (req === detailReq.current) setDetailLoading(false);
    }
  }

  function closeDetail() {
    detailReq.current += 1; // batalkan request yang masih berjalan
    setDetailMonth(null);
    setDetail(null);
    setDetailError('');
  }

  async function handleDeleteAll() {
    if (confirmText.trim() !== 'HAPUS') return;
    setDeleting(true);
    try {
      const res = await csrfFetch('/api/dev/attendance/archive?all=1', { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus data absensi.');
      setConfirmOpen(false);
      setConfirmText('');
      flash('success', `Seluruh data absensi (${data.deleted} sesi) berhasil dihapus permanen.`);
      closeDetail();
      setReloadKey((k) => k + 1);
    } catch (e) {
      flash('error', e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteSession() {
    if (!deleteTarget || confirmSessionText.trim() !== 'HAPUS') return;
    setDeletingSession(true);
    try {
      const res = await csrfFetch(
        `/api/dev/attendance?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: 'DELETE' }
      );
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menghapus sesi absensi.');
      flash(
        'success',
        `Sesi ${classLabel(deleteTarget.className)} — ${formatSundayLabel(deleteTarget.date)} dihapus.`
      );
      setDeleteTarget(null);
      setConfirmSessionText('');
      // Hapus baris dari detail tanpa reload penuh (tanpa kedipan spinner),
      // lalu muat ulang arsip bulanan.
      setDetail((list) => (list || []).filter((s) => s.id !== deleteTarget.id));
      setReloadKey((k) => k + 1);
    } catch (e) {
      flash('error', e.message);
      setDeleteTarget(null);
      setConfirmSessionText('');
    } finally {
      setDeletingSession(false);
    }
  }

  const data = archive || {
    months: [],
    olderCount: 0,
    olderHadir: 0,
    totalSessions: 0,
    totalHadir: 0,
    totalEntries: 0,
    oldestDate: null,
    newestDate: null,
    canDelete: false,
  };

  // ---------- Export (Excel & PDF) ----------
  const exportRows = () => {
    const list =
      selectedMonth === 'all'
        ? data.months
        : data.months.filter((m) => m.key === selectedMonth);
    const rows = list.map((m) => ({
      Bulan: monthLabel(m.key),
      Sesi: m.sessions,
      Hadir: m.hadir,
      Catatan: m.totalEntries,
      'Kehadiran (%)': m.totalEntries ? Math.round((m.hadir / m.totalEntries) * 100) : 0,
    }));
    if (selectedMonth === 'all' && data.months.length > 0) {
      rows.push({
        Bulan: 'TOTAL',
        Sesi: data.totalSessions,
        Hadir: data.totalHadir,
        Catatan: data.totalEntries,
        'Kehadiran (%)': data.totalEntries ? Math.round((data.totalHadir / data.totalEntries) * 100) : 0,
      });
    }
    return rows;
  };

  // Judul/nama export — format "Rekap Kehadiran #bulan #tahun".
  const exportTitle = () => {
    if (selectedMonth === 'all') {
      const year = data.months[0]?.key?.slice(0, 4) || String(new Date().getFullYear());
      return `Rekap Kehadiran ${year}`;
    }
    return `Rekap Kehadiran ${monthLabel(selectedMonth)}`;
  };

  function exportExcel() {
    const rows = exportRows();
    if (!rows.length) {
      flash('error', 'Tidak ada data untuk diekspor.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kehadiran');
    XLSX.writeFile(wb, `${exportTitle()}.xlsx`);
  }

  function exportPdf() {
    const rows = exportRows();
    if (!rows.length) {
      flash('error', 'Tidak ada data untuk diekspor.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(exportTitle(), 14, 15);
    autoTable(doc, {
      startY: 21,
      head: [['Bulan', 'Sesi', 'Hadir', 'Catatan', 'Kehadiran (%)']],
      body: rows.map((r) => [r.Bulan, String(r.Sesi), String(r.Hadir), String(r.Catatan), `${r['Kehadiran (%)']}%`]),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [58, 95, 174], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 246, 248] },
    });
    doc.save(`${exportTitle()}.pdf`);
  }

  async function runExport(kind) {
    setExporting(kind);
    try {
      if (kind === 'excel') exportExcel();
      else exportPdf();
    } catch (e) {
      flash('error', `Gagal membuat ${kind === 'excel' ? 'Excel' : 'PDF'}: ${e.message}`);
    } finally {
      setExporting('');
    }
  }

  const detailSessions = detail || [];
  const detailHadir = detailSessions.reduce((sum, s) => sum + hadirCount(s), 0);
  const detailEntries = detailSessions.reduce((sum, s) => sum + (s.entries || []).length, 0);

  return (
    <div className="d-flex flex-column gap-3 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      {error && (
        <div className="alert-dev alert-dev-danger d-flex align-items-center justify-content-between gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-dev btn-dev-ghost btn-sm-dev flex-none" onClick={() => setReloadKey((k) => k + 1)}>
            <Icon name="refresh" size={14} /> Muat ulang
          </button>
        </div>
      )}

      {loading ? (
        <Spinner label="Memuat data absensi..." />
      ) : (
        <>
          {/* ---- Ringkasan ---- */}
          <div className="row g-3">
            <div className="col-6 col-xl-3">
              <StatCard icon="activity" tint="blue" value={data.totalSessions} label="Total Sesi (1 tahun)" />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard icon="check" tint="green" value={data.totalHadir} label="Total Kehadiran" />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard icon="archive" tint="amber" value={data.olderCount} label="Di luar tahun ini" />
            </div>
            <div className="col-6 col-xl-3">
              <div className="stat-card h-100">
                <span className="stat-icon">
                  <Icon name="calendar" size={17} />
                </span>
                <div className="min-w-0">
                  <div className="stat-value" style={{ fontSize: '0.78rem' }}>
                    {data.oldestDate ? formatDate(data.oldestDate) : '—'}
                    {data.newestDate ? ` → ${formatDate(data.newestDate)}` : ''}
                  </div>
                  <div className="stat-label">Periode (1 tahun kalender)</div>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Absensi per bulan + export + detail ---- */}
          <Card
            title={detailMonth ? `Detail Absensi — ${monthLabel(detailMonth)}` : 'Absensi per Bulan'}
            icon="calendar"
            actions={
              detailMonth ? (
                <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={closeDetail} title="Kembali ke daftar bulan">
                  <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} />
                  Kembali
                </button>
              ) : (
                <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setReloadKey((k) => k + 1)} title="Segarkan">
                  <Icon name="refresh" size={15} /> Segarkan
                </button>
              )
            }
          >
            {!detailMonth && (
              <>
                {/* Toolbar export — pilih bulan lalu unduh Excel/PDF */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <select
                    className="dev-select"
                    style={{ maxWidth: 260 }}
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    aria-label="Pilih bulan untuk export"
                  >
                    <option value="all">Semua bulan (Jan–Des)</option>
                    {data.months.map((m) => (
                      <option key={m.key} value={m.key}>
                        {monthLabel(m.key)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-dev btn-dev-outline btn-sm-dev"
                    onClick={() => runExport('excel')}
                    disabled={Boolean(exporting) || data.totalSessions === 0}
                    title={data.totalSessions === 0 ? 'Belum ada data untuk diekspor' : 'Unduh Excel (.xlsx)'}
                  >
                    {exporting === 'excel' ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    ) : (
                      <Icon name="fileText" size={14} />
                    )}
                    Excel
                  </button>
                  <button
                    type="button"
                    className="btn-dev btn-dev-outline btn-sm-dev"
                    onClick={() => runExport('pdf')}
                    disabled={Boolean(exporting) || data.totalSessions === 0}
                    title={data.totalSessions === 0 ? 'Belum ada data untuk diekspor' : 'Unduh PDF'}
                  >
                    {exporting === 'pdf' ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    ) : (
                      <Icon name="download" size={14} />
                    )}
                    PDF
                  </button>
                </div>

                {data.totalSessions === 0 ? (
                  <EmptyState icon="archive" title="Belum ada data absensi" />
                ) : (
                  <div className="row g-3">
                    {data.months.map((m) => {
                      const ratio = m.totalEntries ? Math.round((m.hadir / m.totalEntries) * 100) : 0;
                      return (
                        <div key={m.key} className="col-6 col-md-4 col-xxl-3">
                          <div
                            role="button"
                            tabIndex={0}
                            className={`month-card ${m.sessions === 0 ? 'is-empty' : ''}`}
                            onClick={() => openDetail(m.key)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openDetail(m.key);
                            }}
                            title="Lihat detail hari & tanggal bulan ini"
                          >
                            <div className="d-flex justify-content-between align-items-start gap-2">
                              <span className="month-card-name">{monthLabel(m.key)}</span>
                              {m.sessions === 0 ? (
                                <span className="pill pill-gray">Kosong</span>
                              ) : (
                                <Icon name="arrowRight" size={13} style={{ color: 'var(--dev-muted)' }} />
                              )}
                            </div>
                            <div className="month-card-num">{m.sessions}</div>
                            <div className="text-muted-dev" style={{ fontSize: '0.72rem' }}>
                              {m.sessions === 0 ? 'belum ada sesi' : `${m.hadir} hadir dari ${m.totalEntries} catatan`}
                            </div>
                            {m.sessions > 0 && (
                              <div className="att-bar mt-2">
                                <div className="att-bar-fill" style={{ width: `${ratio}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {data.olderCount > 0 && (
                  <div className="alert-dev alert-dev-amber d-flex align-items-center gap-2 mt-3 mb-0" role="alert">
                    <Icon name="info" size={15} className="flex-none" />
                    <span>
                      {data.olderCount} sesi absensi berada di luar tahun kalender berjalan (Januari–Desember)
                      dan belum termasuk perhitungan di atas — data tersebut ikut dihapus saat tombol hapus dijalankan.
                    </span>
                  </div>
                )}
              </>
            )}

            {detailMonth && (
              <>
                <div className="d-flex align-items-center gap-3 mb-3 text-muted-dev" style={{ fontSize: '0.8rem' }}>
                  <span>
                    <strong style={{ color: 'var(--dev-text)' }}>{detailSessions.length}</strong> sesi
                  </span>
                  <span>
                    <strong style={{ color: 'var(--dev-text)' }}>{detailHadir}</strong> hadir dari{' '}
                    <strong style={{ color: 'var(--dev-text)' }}>{detailEntries}</strong> catatan
                  </span>
                </div>

                {detailError ? (
                  <EmptyState
                    icon="alert"
                    title="Gagal memuat detail"
                    sub={detailError}
                  />
                ) : detailLoading && !detail ? (
                  <Spinner label="Memuat detail absensi..." />
                ) : detailSessions.length === 0 ? (
                  <EmptyState icon="calendar" title="Belum ada sesi pada bulan ini" />
                ) : (
                  <div className="table-responsive">
                    <table className="dev-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Kelas</th>
                          <th>Kehadiran</th>
                          <th style={{ textAlign: 'right' }}>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailSessions.map((s) => {
                          const total = (s.entries || []).length;
                          const hadir = hadirCount(s);
                          const ratio = total ? Math.round((hadir / total) * 100) : 0;
                          return (
                            <tr key={s.id}>
                              <td>
                                <span className="fw-semibold">{formatSundayLabel(s.date)}</span>
                              </td>
                              <td>
                                <span className="pill pill-blue">{classLabel(s.className)}</span>
                              </td>
                              <td>
                                <div className="d-flex align-items-center gap-2" style={{ maxWidth: 220 }}>
                                  <div className="att-bar flex-grow-1">
                                    <div className="att-bar-fill" style={{ width: `${ratio}%` }} />
                                  </div>
                                  <span className="text-muted-dev" style={{ fontSize: '0.76rem' }}>
                                    <strong style={{ color: 'var(--dev-green)' }}>{hadir}</strong> / {total} hadir
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="d-flex gap-1 justify-content-end">
                                  <button
                                    className="action-btn"
                                    title="Lihat nama anak"
                                    onClick={() => setNameView(s)}
                                  >
                                    <Icon name="eye" size={15} />
                                  </button>
                                  <button
                                    className="action-btn danger"
                                    title="Hapus sesi absensi"
                                    onClick={() => {
                                      setConfirmSessionText('');
                                      setDeleteTarget(s);
                                    }}
                                  >
                                    <Icon name="trash" size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* ---- Zona bahaya: hapus semua data ---- */}
          <section className="danger-zone p-4">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <span className="danger-zone-icon">
                <Icon name="trash" size={19} />
              </span>
              <div className="flex-grow-1" style={{ minWidth: 240 }}>
                <h6 className="mb-1" style={{ fontSize: '0.85rem' }}>Hapus Semua Data Absensi</h6>
                {data.canDelete ? (
                  <p className="mb-0" style={{ fontSize: '0.78rem' }}>
                    Data absensi telah terakumulasi 1 tahun penuh (sejak{' '}
                    {data.oldestDate ? formatDate(data.oldestDate) : '—'}). Hapus seluruhnya secara permanen
                    dari database untuk mencegah penumpukan.
                  </p>
                ) : (
                  <p className="mb-0" style={{ fontSize: '0.78rem' }}>
                    Tombol hapus akan tersedia setelah data absensi terakumulasi 1 tahun penuh.
                    {data.oldestDate && (
                      <>
                        {' '}Sesi tertua saat ini: <strong>{formatDate(data.oldestDate)}</strong>.
                      </>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-dev btn-dev-danger px-4"
                disabled={!data.canDelete || deleting}
                onClick={() => setConfirmOpen(true)}
                title={
                  data.canDelete ? 'Hapus seluruh data absensi' : 'Belum tersedia — tunggu hingga 1 tahun penuh'
                }
              >
                {deleting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Menghapus...
                  </>
                ) : data.canDelete ? (
                  <>
                    <Icon name="trash" size={16} /> Hapus Semua Data
                  </>
                ) : (
                  <>
                    <Icon name="lock" size={16} /> Terkunci
                  </>
                )}
              </button>
            </div>
          </section>
        </>
      )}

      {/* ---- Modal konfirmasi hapus semua permanen ---- */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Hapus Permanen?"
        footer={
          <>
            <button type="button" className="btn-dev btn-dev-outline" onClick={() => setConfirmOpen(false)}>
              Batal
            </button>
            <button
              type="button"
              className="btn-dev btn-dev-danger"
              disabled={confirmText.trim() !== 'HAPUS' || deleting}
              onClick={handleDeleteAll}
            >
              {deleting ? 'Menghapus...' : 'Hapus Permanen'}
            </button>
          </>
        }
      >
        <p className="text-muted-dev" style={{ fontSize: '0.82rem' }}>
          Tindakan ini akan menghapus <strong className="text-danger">{data.totalSessions} sesi</strong> absensi
          secara <strong className="text-danger">permanen</strong> dari database website utama dan tidak dapat
          dibatalkan. Semua riwayat kehadiran per kelas akan hilang.
        </p>
        <label className="dev-label" htmlFor="confirm-clear">
          Ketik <strong>HAPUS</strong> untuk melanjutkan
        </label>
        <input
          id="confirm-clear"
          type="text"
          className="dev-input"
          placeholder="HAPUS"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </Modal>

      {/* ---- Modal detail nama anak per sesi ---- */}
      <Modal
        open={Boolean(nameView)}
        onClose={() => setNameView(null)}
        title={
          nameView
            ? `Kehadiran — ${classLabel(nameView.className)}, ${formatSundayLabel(nameView.date)}`
            : 'Detail Kehadiran'
        }
      >
        {(nameView?.entries || []).length === 0 ? (
          <EmptyState icon="user" title="Tidak ada catatan nama" />
        ) : (
          <div className="d-flex flex-column gap-1" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {(nameView?.entries || []).map((e, i) => (
              <div
                key={i}
                className="d-flex align-items-center justify-content-between gap-2 px-3 py-2"
                style={{
                  background: 'var(--dev-surface-2)',
                  border: '1px solid var(--dev-border)',
                  borderRadius: 8,
                }}
              >
                <span className="fw-medium" style={{ fontSize: '0.85rem' }}>{e.name}</span>
                {e.present ? (
                  <span className="pill pill-green">Hadir</span>
                ) : (
                  <span className="pill pill-red">Tidak</span>
                )}
              </div>
            ))}
          </div>
        )}
        {nameView && (
          <p className="text-muted-dev mt-3 mb-0" style={{ fontSize: '0.75rem' }}>
            <strong style={{ color: 'var(--dev-text)' }}>{hadirCount(nameView)}</strong> hadir dari{' '}
            <strong style={{ color: 'var(--dev-text)' }}>{(nameView.entries || []).length}</strong> anak
          </p>
        )}
      </Modal>

      {/* ---- Modal konfirmasi hapus satu sesi ---- */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmSessionText('');
        }}
        title="Hapus Sesi Absensi?"
        footer={
          <>
            <button
              type="button"
              className="btn-dev btn-dev-outline"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmSessionText('');
              }}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-dev btn-dev-danger"
              disabled={confirmSessionText.trim() !== 'HAPUS' || deletingSession}
              onClick={confirmDeleteSession}
            >
              {deletingSession ? 'Menghapus...' : 'Ya, Hapus Sesi'}
            </button>
          </>
        }
      >
        <div className="alert-dev alert-dev-danger mb-0">
          Yakin ingin menghapus absensi{' '}
          <strong>{deleteTarget ? classLabel(deleteTarget.className) : ''}</strong> —{' '}
          <strong>{deleteTarget ? formatSundayLabel(deleteTarget.date) : ''}</strong>? Riwayat kehadiran sesi
          ini akan hilang permanen dari database website utama.
        </div>
        <label className="dev-label" htmlFor="confirm-session" style={{ marginTop: 16 }}>
          Ketik <strong>HAPUS</strong> untuk melanjutkan
        </label>
        <input
          id="confirm-session"
          type="text"
          className="dev-input"
          placeholder="HAPUS"
          value={confirmSessionText}
          onChange={(e) => setConfirmSessionText(e.target.value)}
          autoComplete="off"
        />
      </Modal>
    </div>
  );
}

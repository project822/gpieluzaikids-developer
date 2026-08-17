'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { Card, StatCard, Spinner, EmptyState } from '@/components/ui/DevUI';
import { authedFetch, safeJson } from '@/lib/csrfClient';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '–';
  }
}

export default function RegistrationPage() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Export state
  const [exporting, setExporting] = useState('');

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  }

  // Load events list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/dev/events', { cache: 'no-store' });
        const data = await safeJson(res);
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Gagal memuat data event.');
        setEvents(data.data || []);
        setError('');
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Load registrations when event selected
  const regReq = useRef(0);
  useEffect(() => {
    if (!selectedEvent) {
      setRegistrations([]);
      return;
    }
    const req = ++regReq.current;
    (async () => {
      setLoadingRegistrations(true);
      try {
        const res = await authedFetch(`/api/dev/registrations?eventId=${encodeURIComponent(selectedEvent)}`, { cache: 'no-store' });
        const json = await safeJson(res);
        if (req !== regReq.current) return;
        if (!res.ok) throw new Error(json.error || 'Gagal memuat data pendaftaran.');
        setRegistrations(json.data || []);
      } catch (e) {
        if (req === regReq.current) {
          setRegistrations([]);
          flash('error', e.message);
        }
      } finally {
        if (req === regReq.current) setLoadingRegistrations(false);
      }
    })();
    return () => { regReq.current += 1; };
  }, [selectedEvent]);

  async function handleExport(type) {
    if (!selectedEvent) return;
    setExporting(type);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const selectedEventObj = events.find((e) => e.id === selectedEvent);
      const eventName = selectedEventObj?.title || 'Event';
      const title = `Rekap Pendaftaran ${eventName}`;

      if (type === 'excel') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Rekap Pendaftaran');
        ws.columns = [
          { header: 'No', key: 'No', width: 6 },
          { header: 'Nama Lengkap', key: 'Nama Lengkap', width: 30 },
          { header: 'Email', key: 'Email', width: 30 },
          { header: 'No. WhatsApp', key: 'No. WhatsApp', width: 18 },
          { header: 'Tanggal Daftar', key: 'Tanggal Daftar', width: 22 },
        ];
        const titleRow = ws.addRow([title]);
        const countRow = ws.addRow([`Total Pendaftar: ${registrations.length}`]);
        ws.addRow([]);
        registrations.forEach((r, i) => {
          ws.addRow({
            'No': i + 1,
            'Nama Lengkap': r.fullName || '',
            'Email': r.email || '',
            'No. WhatsApp': r.whatsapp || '',
            'Tanggal Daftar': formatDateTime(r.createdAt),
          });
        });
        ws.mergeCells(titleRow.number, 1, titleRow.number, 5);
        ws.mergeCells(countRow.number, 1, countRow.number, 5);
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF0D6EFD' } };
        countRow.getCell(1).font = { size: 10, color: { argb: 'FF6C757D' } };

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const doc = new jsPDF();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(13, 110, 253);
        doc.text(title, 14, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(108, 117, 125);
        doc.text(`GPI Eluzai Kids — Sekolah Minggu`, 14, 22);
        doc.text(`Total Pendaftar: ${registrations.length}`, 14, 28);
        autoTable(doc, {
          startY: 34,
          head: [['No', 'Nama Lengkap', 'Email', 'No. WhatsApp', 'Tanggal Daftar']],
          body: registrations.map((r, i) => [
            String(i + 1),
            r.fullName || '',
            r.email || '',
            r.whatsapp || '',
            formatDateTime(r.createdAt),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [13, 110, 253], fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2.5 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            4: { cellWidth: 28 },
          },
        });
        doc.save(`${title}.pdf`);
      }
    } catch (e) {
      flash('error', `Gagal membuat ${type === 'excel' ? 'Excel' : 'PDF'}: ${e.message}`);
    } finally {
      setExporting('');
    }
  }

  const selectedEventObj = events.find((e) => e.id === selectedEvent);

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
        <Spinner label="Memuat data event..." />
      ) : (
        <>
          {/* ---- Ringkasan ---- */}
          <div className="row g-3">
            <div className="col-6 col-xl-3">
              <StatCard icon="users" tint="blue" value={events.length} label="Total Event" />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard icon="check" tint="green" value={events.filter((e) => e.formActive).length} label="Form Aktif" />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard icon="activity" tint="amber" value={registrations.length} label="Total Pendaftar" />
            </div>
            <div className="col-6 col-xl-3">
              <div className="stat-card h-100">
                <span className="stat-icon">
                  <Icon name="calendar" size={17} />
                </span>
                <div className="min-w-0">
                  <div className="stat-value" style={{ fontSize: '0.78rem' }}>
                    {selectedEventObj ? selectedEventObj.title : 'Pilih event'}
                  </div>
                  <div className="stat-label">Event Terpilih</div>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Pendaftaran per Event ---- */}
          <Card
            title="Data Pendaftaran"
            icon="users"
            actions={
              <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setReloadKey((k) => k + 1)} title="Segarkan">
                <Icon name="refresh" size={15} /> Segarkan
              </button>
            }
          >
            {/* Toolbar */}
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <select
                className="dev-select"
                style={{ maxWidth: 360 }}
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                aria-label="Pilih event"
              >
                <option value="">— Pilih Event —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({formatDate(ev.date)})
                  </option>
                ))}
              </select>
              {selectedEvent && (
                <>
                  <button
                    type="button"
                    className="btn-dev btn-dev-outline btn-sm-dev"
                    onClick={() => handleExport('excel')}
                    disabled={Boolean(exporting) || registrations.length === 0}
                    title={registrations.length === 0 ? 'Belum ada data' : 'Unduh Excel'}
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
                    onClick={() => handleExport('pdf')}
                    disabled={Boolean(exporting) || registrations.length === 0}
                    title={registrations.length === 0 ? 'Belum ada data' : 'Unduh PDF'}
                  >
                    {exporting === 'pdf' ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    ) : (
                      <Icon name="download" size={14} />
                    )}
                    PDF
                  </button>
                </>
              )}
            </div>

            {!selectedEvent ? (
              <EmptyState icon="calendar" title="Pilih event" sub="Pilih event untuk melihat data pendaftaran" />
            ) : loadingRegistrations ? (
              <Spinner label="Memuat data pendaftaran..." />
            ) : registrations.length === 0 ? (
              <EmptyState icon="users" title="Belum ada pendaftar" sub="Event ini belum memiliki data pendaftaran" />
            ) : (
              <>
                <div className="d-flex align-items-center gap-3 mb-3 text-muted-dev" style={{ fontSize: '0.8rem' }}>
                  <span>
                    <strong style={{ color: 'var(--dev-text)' }}>{registrations.length}</strong> pendaftar
                  </span>
                  {selectedEventObj && (
                    <span className={`pill ${selectedEventObj.formActive ? 'pill-green' : 'pill-red'}`}>
                      {selectedEventObj.formActive ? 'Form Aktif' : 'Form Nonaktif'}
                    </span>
                  )}
                </div>
                <div className="table-responsive">
                  <table className="dev-table">
                    <thead>
                      <tr>
                        <th style={{ width: 50 }}>No</th>
                        <th>Nama Lengkap</th>
                        <th>Email</th>
                        <th>No. WhatsApp</th>
                        <th>Tanggal Daftar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((r, i) => (
                        <tr key={r.id}>
                          <td>{i + 1}</td>
                          <td>
                            <span className="fw-semibold">{r.fullName}</span>
                          </td>
                          <td>{r.email}</td>
                          <td>{r.whatsapp}</td>
                          <td>
                            <span className="text-muted-dev" style={{ fontSize: '0.8rem' }}>
                              {formatDateTime(r.createdAt)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

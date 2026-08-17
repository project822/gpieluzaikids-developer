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

function formatDateOnly(iso) {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '–';
  }
}

const FIELD_TYPES = [
  { value: 'text', label: 'Teks' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Telepon' },
  { value: 'number', label: 'Angka' },
  { value: 'select', label: 'Pilihan (Dropdown)' },
  { value: 'checkbox', label: 'Centang (Toggle)' },
  { value: 'textarea', label: 'Teks Panjang' },
];

function emptyField() {
  return { label: '', type: 'text', required: false, options: [], placeholder: '' };
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

  // Form editor state
  const [customFields, setCustomFields] = useState([]);
  const [savingForm, setSavingForm] = useState(false);
  const [formEditorOpen, setFormEditorOpen] = useState(false);

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

  // Open form editor for selected event
  function openFormEditor() {
    const ev = events.find((e) => e.id === selectedEvent);
    if (!ev) return;
    setCustomFields(Array.isArray(ev.customFormFields) ? ev.customFields ?? ev.customFormFields.map((f) => ({ ...f })) : []);
    setFormEditorOpen(true);
  }

  const displayFormTitle = 'Form Pendaftaran';

  function addField() {
    setCustomFields((prev) => [...prev, emptyField()]);
  }

  function removeField(idx) {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateField(idx, key, value) {
    setCustomFields((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  }

  function moveField(idx, dir) {
    setCustomFields((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  async function saveFormConfig(e) {
    e.preventDefault();
    setSavingForm(true);
    try {
      const ev = events.find((ev) => ev.id === selectedEvent);
      if (!ev) throw new Error('Event tidak ditemukan.');
      // Filter fields kosong
      const cleaned = customFields.filter((f) => f.label.trim());
      // Judul form otomatis: "Form Pendaftaran" bold + nama event (tidak perlu diedit)
      const autoTitle = `Form Pendaftaran`;
      const res = await authedFetch(`/api/dev/events/${selectedEvent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formTitle: autoTitle, customFormFields: cleaned }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan.');
      setFormEditorOpen(false);
      flash('success', 'Konfigurasi form berhasil disimpan.');
      setReloadKey((k) => k + 1);
    } catch (e) {
      flash('error', e.message);
    } finally {
      setSavingForm(false);
    }
  }

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
      const evCustomFields = Array.isArray(selectedEventObj?.customFormFields) ? selectedEventObj.customFormFields : [];

      const baseCols = [
        { header: 'No', key: 'No', width: 6 },
        { header: 'Nama Lengkap', key: 'Nama Lengkap', width: 30 },
        { header: 'Email', key: 'Email', width: 30 },
        { header: 'No. WhatsApp', key: 'No. WhatsApp', width: 18 },
        { header: 'Tanggal Daftar', key: 'Tanggal Daftar', width: 22 },
      ];
      const customCols = evCustomFields.map((f) => ({ header: f.label, key: f.label, width: 24 }));
      const allCols = [...baseCols, ...customCols];

      if (type === 'graphics') {
        const graphicsTitle = `Grafik Pendaftaran ${eventName}`;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Grafik Pendaftaran');
        const gTitleRow = ws.addRow([graphicsTitle]);
        ws.mergeCells(gTitleRow.number, 1, gTitleRow.number, 3);
        gTitleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF0D6EFD' } };
        gTitleRow.getCell(1).alignment = { horizontal: 'center' };
        ws.addRow([]);
        ws.addRow(['Tanggal', 'Jumlah Pendaftar', 'Kumulatif']);
        ws.getColumn(1).width = 24;
        ws.getColumn(2).width = 18;
        ws.getColumn(3).width = 14;
        const dateCounts = {};
        registrations.forEach((r) => {
          const d = formatDateOnly(r.createdAt);
          dateCounts[d] = (dateCounts[d] || 0) + 1;
        });
        const entries = Object.entries(dateCounts);
        let cumulative = 0;
        const firstDataRow = 4;
        entries.forEach(([date, count]) => {
          cumulative += count;
          ws.addRow([date, count, cumulative]);
        });
        if (entries.length > 0) {
          const lastRow = firstDataRow + entries.length - 1;
          ws.addChart(
            {
              type: 'bar',
              title: { text: graphicsTitle },
              legend: { position: 'bottom' },
              series: [
                {
                  title: { text: 'Pendaftar per Tanggal' },
                  cat: { f: `'Grafik Pendaftaran'!A${firstDataRow}:A${lastRow}` },
                  val: { f: `'Grafik Pendaftaran'!B${firstDataRow}:B${lastRow}` },
                },
              ],
              plotArea: { border: { color: 'CCCCCC' } },
            },
            { tl: { col: 0, row: lastRow + 2 }, cx: 20, cy: 12 }
          );
        }
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${graphicsTitle}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (type === 'excel') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Rekap Pendaftaran');
        ws.columns = allCols;
        const titleRow = ws.addRow([title]);
        const countRow = ws.addRow([`Total Pendaftar: ${registrations.length}`]);
        ws.addRow([]);
        registrations.forEach((r, i) => {
          const row = {
            'No': i + 1,
            'Nama Lengkap': r.fullName || '',
            'Email': r.email || '',
            'No. WhatsApp': r.whatsapp || '',
            'Tanggal Daftar': formatDateOnly(r.createdAt),
          };
          const cf = r.customFields || {};
          evCustomFields.forEach((f) => { row[f.label] = cf[f.label] || ''; });
          ws.addRow(row);
        });
        ws.mergeCells(titleRow.number, 1, titleRow.number, allCols.length);
        ws.mergeCells(countRow.number, 1, countRow.number, allCols.length);
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
        const doc = new jsPDF({ orientation: evCustomFields.length > 3 ? 'landscape' : 'portrait' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(13, 110, 253);
        doc.text(title, 14, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(108, 117, 125);
        doc.text(`GPI Eluzai Kids — Sekolah Minggu`, 14, 22);
        doc.text(`Total Pendaftar: ${registrations.length}`, 14, 28);
        const head = [['No', 'Nama Lengkap', 'Email', 'No. WhatsApp', 'Tanggal Daftar', ...evCustomFields.map((f) => f.label)]];
        const body = registrations.map((r, i) => {
          const cf = r.customFields || {};
          return [
            String(i + 1),
            r.fullName || '',
            r.email || '',
            r.whatsapp || '',
            formatDateOnly(r.createdAt),
            ...evCustomFields.map((f) => cf[f.label] || ''),
          ];
        });
        autoTable(doc, {
          startY: 34,
          head,
          body,
          theme: 'striped',
          headStyles: { fillColor: [13, 110, 253], fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2.5 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
          },
        });
        doc.save(`${title}.pdf`);
      }
    } catch (e) {
      flash('error', `Gagal membuat file: ${e.message}`);
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
              <div className="d-flex gap-2">
                {selectedEvent && (
                  <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={openFormEditor} title="Edit Form Pendaftaran">
                    <Icon name="edit" size={15} /> Edit Form
                  </button>
                )}
                <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={() => setReloadKey((k) => k + 1)} title="Segarkan">
                  <Icon name="refresh" size={15} /> Segarkan
                </button>
              </div>
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
                  <button
                    type="button"
                    className="btn-dev btn-dev-outline btn-sm-dev"
                    onClick={() => handleExport('graphics')}
                    disabled={Boolean(exporting) || registrations.length === 0}
                    title={registrations.length === 0 ? 'Belum ada data' : 'Unduh grafik pendaftaran'}
                  >
                    {exporting === 'graphics' ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    ) : (
                      <Icon name="activity" size={14} />
                    )}
                    Grafik
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
                  {selectedEventObj && Array.isArray(selectedEventObj.customFormFields) && selectedEventObj.customFormFields.length > 0 && (
                    <span className="pill pill-blue">
                      {selectedEventObj.customFormFields.length} Kolom Custom
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
                        {selectedEventObj && Array.isArray(selectedEventObj.customFormFields) && selectedEventObj.customFormFields.map((f) => (
                          <th key={f.label}>{f.label}</th>
                        ))}
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
                          {selectedEventObj && Array.isArray(selectedEventObj.customFormFields) && selectedEventObj.customFormFields.map((f) => (
                            <td key={f.label}>
                              <span className="text-muted-dev" style={{ fontSize: '0.8rem' }}>
                                {(r.customFields || {})[f.label] || '–'}
                              </span>
                            </td>
                          ))}
                          <td>
                            <span className="text-muted-dev" style={{ fontSize: '0.8rem' }}>
                              {formatDateOnly(r.createdAt)}
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

      {/* ---- Modal Form Editor ---- */}
      {formEditorOpen && (
        <div className="modal-backdrop-eluzai" onMouseDown={(e) => e.target === e.currentTarget && setFormEditorOpen(false)}>
          <div className="modal-card-eluzai" style={{ maxWidth: 900 }}>
            <div className="d-flex justify-content-between align-items-center p-4 pb-0">
              <h5 className="mb-0">Edit Form Pendaftaran</h5>
              <button className="icon-btn" onClick={() => setFormEditorOpen(false)} aria-label="Tutup">
                <Icon name="x" size={18} />
              </button>
            </div>
            <form onSubmit={saveFormConfig}>
              <div className="p-4 d-flex flex-column gap-3">
                {/* Judul Form — tidak bisa diedit, format otomatis */}
                <div>
                  <label className="form-label fw-semibold text-sm">Judul Form</label>
                  <div
                    className="form-control"
                    style={{ background: 'var(--dev-bg)', cursor: 'default', fontWeight: 'bold', fontSize: '1.05rem' }}
                  >
                    {displayFormTitle}
                  </div>
                  <div className="text-sm text-secondary mt-1">
                    {selectedEventObj?.title ? `Judul otomatis: "${displayFormTitle}"` : 'Judul mengikuti nama event'}
                  </div>
                </div>

                {/* Custom Fields */}
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label fw-semibold text-sm mb-0">Field Form Tambahan</label>
                    <button type="button" className="btn-dev btn-dev-ghost btn-sm-dev" onClick={addField}>
                      <Icon name="plus" size={14} /> Tambah Field
                    </button>
                  </div>

                  {customFields.length === 0 ? (
                    <div className="text-sm text-secondary text-center py-3" style={{ background: 'var(--dev-bg)', borderRadius: 8 }}>
                      Belum ada field tambahan. Klik &quot;Tambah Field&quot; untuk menambah kolom baru.
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {customFields.map((field, idx) => (
                        <div key={idx} className="p-3" style={{ background: 'var(--dev-bg)', borderRadius: 8, border: '1px solid var(--dev-border)' }}>
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <button type="button" className="icon-btn" onClick={() => moveField(idx, -1)} disabled={idx === 0} title="Naikkan">
                              <Icon name="chevron-up" size={14} />
                            </button>
                            <button type="button" className="icon-btn" onClick={() => moveField(idx, 1)} disabled={idx === customFields.length - 1} title="Turunkan">
                              <Icon name="chevron-down" size={14} />
                            </button>
                            <span className="text-sm fw-semibold flex-grow-1">#{idx + 1}</span>
                            <div className="form-check form-switch mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(idx, 'required', e.target.checked)}
                                id={`cf-req-${idx}`}
                              />
                              <label className="form-check-label text-sm" htmlFor={`cf-req-${idx}`}>Wajib</label>
                            </div>
                            <button type="button" className="icon-btn danger" onClick={() => removeField(idx)} title="Hapus field">
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <div className="row g-2">
                            <div className="col-md-5">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={field.label}
                                onChange={(e) => updateField(idx, 'label', e.target.value)}
                                placeholder="Nama kolom (contoh: Pilihan Sesi)"
                                maxLength={100}
                                required
                              />
                            </div>
                            <div className="col-md-3">
                              <select
                                className="form-select form-select-sm"
                                value={field.type}
                                onChange={(e) => {
                                  updateField(idx, 'type', e.target.value);
                                  if (e.target.value !== 'select') updateField(idx, 'options', []);
                                }}
                              >
                                {FIELD_TYPES.map((ft) => (
                                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-md-4">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(idx, 'placeholder', e.target.value)}
                                placeholder="Placeholder (opsional)"
                                maxLength={200}
                              />
                            </div>
                          </div>
                          {field.type === 'select' && (
                            <div className="mt-2">
                              <label className="form-label text-sm mb-1">Pilihan (satu per baris)</label>
                              <textarea
                                className="form-control form-control-sm"
                                rows={2}
                                value={(field.options || []).join('\n')}
                                onChange={(e) => updateField(idx, 'options', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                                placeholder={"Sesi 1\nSesi 2"}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Preview Halaman Form */}
                <div>
                  <label className="form-label fw-semibold text-sm mb-2">Preview Form Pendaftaran</label>
                  <div
                    style={{
                      background: 'var(--dev-surface)',
                      border: '1px solid var(--dev-border)',
                      borderRadius: 8,
                      padding: '16px 20px',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 4 }}>{displayFormTitle}</div>
                    <div className="text-muted-dev" style={{ fontSize: '0.76rem', marginBottom: 12 }}>
                      {selectedEventObj?.title || 'Nama Event'}
                    </div>

                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="fw-semibold text-sm">Nama Lengkap <span className="text-danger">*</span></label>
                        <div className="form-control form-control-sm" style={{ background: 'var(--dev-bg)', cursor: 'default' }}>Masukkan nama lengkap</div>
                      </div>
                      <div>
                        <label className="fw-semibold text-sm">Alamat Email <span className="text-danger">*</span></label>
                        <div className="form-control form-control-sm" style={{ background: 'var(--dev-bg)', cursor: 'default' }}>contoh: nama@email.com</div>
                      </div>
                      <div>
                        <label className="fw-semibold text-sm">Nomor WhatsApp Aktif <span className="text-danger">*</span></label>
                        <div className="form-control form-control-sm" style={{ background: 'var(--dev-bg)', cursor: 'default' }}>contoh: 081234567890</div>
                      </div>

                      {customFields.filter((f) => f.label.trim()).map((field, i) => (
                        <div key={i}>
                          {field.type === 'checkbox' ? (
                            <div className="form-check form-switch">
                              <input className="form-check-input" type="checkbox" disabled id={`preview-cf-${i}`} />
                              <label className="form-check-label fw-semibold text-sm" htmlFor={`preview-cf-${i}`}>
                                {field.label}{field.required && <span className="text-danger"> *</span>}
                              </label>
                            </div>
                          ) : field.type === 'select' ? (
                            <>
                              <label className="fw-semibold text-sm">{field.label}{field.required && <span className="text-danger"> *</span>}</label>
                              <select className="form-select form-select-sm" disabled style={{ background: 'var(--dev-bg)' }}>
                                <option>{field.placeholder || '-- Pilih --'}</option>
                                {(field.options || []).map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </>
                          ) : field.type === 'textarea' ? (
                            <>
                              <label className="fw-semibold text-sm">{field.label}{field.required && <span className="text-danger"> *</span>}</label>
                              <div className="form-control form-control-sm" style={{ background: 'var(--dev-bg)', cursor: 'default', minHeight: 48 }}>{field.placeholder || ''}</div>
                            </>
                          ) : (
                            <>
                              <label className="fw-semibold text-sm">{field.label}{field.required && <span className="text-danger"> *</span>}</label>
                              <div className="form-control form-control-sm" style={{ background: 'var(--dev-bg)', cursor: 'default' }}>{field.placeholder || ''}</div>
                            </>
                          )}
                        </div>
                      ))}

                      <div className="mt-2">
                        <div className="btn-dev btn-dev-masuk w-100 text-center" style={{ opacity: 0.6 }}>
                          Kirim Pendaftaran
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 p-4 pt-0">
                <button type="button" className="btn-dev btn-dev-outline" onClick={() => setFormEditorOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-dev btn-dev-masuk" disabled={savingForm}>
                  {savingForm ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Konfigurasi'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

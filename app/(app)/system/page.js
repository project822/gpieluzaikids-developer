'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { Card, Spinner, StatusPill, usePolling } from '@/components/ui/DevUI';
import { authedFetch, csrfFetch, safeJson } from '@/lib/csrfClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:22889';

function injectBase(html, baseUrl) {
  // Agar aset relatif (_next/static, gambar) dimuat dari website utama.
  return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}/">`);
}

export default function SystemPage() {
  // Status & kontrol maintenance dibaca/ditulis LANGSUNG dari MongoDB bersama
  // website utama (lib/maintenanceRepo.js) — bukan lewat proxy /api/dev/*.
  // Konsisten dengan pola user database: tidak bergantung pada website utama
  // online atau kecocokan DEV_API_KEY.
  const { data: maintenanceData, error: maintenanceError, refresh: refreshMaintenance } = usePolling(async () => {
    const res = await authedFetch('/api/system/maintenance');
    if (!res.ok) throw new Error('Gagal memuat status maintenance.');
    return safeJson(res);
  }, 8000);
  const maintenance = maintenanceData?.maintenance;
  const maintenanceLoading = maintenanceData === null;

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Form teks maintenance
  const [text, setText] = useState({ title: '', message: '', footer: '' });
  const hydrated = useRef(false);

  // Isi form sekali saat data pertama masuk (polling berikutnya tidak
  // menimpa teks yang sedang diketik user). Ditunda agar tidak memicu
  // setState sinkron dalam efek.
  useEffect(() => {
    if (!maintenance || hydrated.current) return;
    const id = setTimeout(() => {
      hydrated.current = true;
      setText({
        title: maintenance.title || '',
        message: maintenance.message || '',
        footer: maintenance.footer || '',
      });
    }, 0);
    return () => clearTimeout(id);
  }, [maintenance]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await authedFetch('/api/preview');
      const json = await safeJson(res);
      if (!res.ok || json.status === 0) throw new Error('Website utama tidak dapat dijangkau.');
      setPreview(json);
    } catch (e) {
      setPreviewError(e.message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Muat preview saat halaman dibuka & saat status maintenance berubah.
  useEffect(() => {
    const id = setTimeout(() => {
      loadPreview();
    }, 0);
    return () => clearTimeout(id);
  }, [loadPreview, maintenance?.enabled]);

  function flash(type, textMsg) {
    setMsg({ type, text: textMsg });
    setTimeout(() => setMsg(null), 5000);
  }

  // Simpan toggle + teks maintenance sekaligus — tulis LANGSUNG ke MongoDB
  // bersama website utama (endpoint lokal, bukan proxy).
  async function saveMaintenance({ toggle, next } = {}) {
    setSaving(true);
    setMsg(null);
    const payload = {
      title: text.title,
      message: text.message,
      footer: text.footer,
    };
    if (toggle) payload.maintenance = next;
    try {
      const res = await csrfFetch('/api/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan.');
      flash('success', 'Pengaturan maintenance disimpan.');
      refreshMaintenance();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const maintenanceOn = Boolean(maintenance?.enabled);

  return (
    <div className="d-flex flex-column gap-4 fade-in">
      {msg && (
        <div className={`alert-dev ${msg.type === 'success' ? 'alert-dev-success' : 'alert-dev-danger'}`} role="alert">
          {msg.text}
        </div>
      )}

      <div className="row g-3">
        {/* Kontrol maintenance */}
        <div className="col-lg-5">
          <Card
            title="Maintenance Mode"
            sub="Berlaku seketika tanpa restart server."
            icon="wrench"
            actions={
              maintenance ? (
                <StatusPill tone={maintenanceOn ? 'amber' : 'green'}>
                  {maintenanceOn ? 'AKTIF' : 'NONAKTIF'}
                </StatusPill>
              ) : null
            }
          >
            {maintenanceLoading && !maintenance ? (
              <Spinner label="Memuat status maintenance..." />
            ) : maintenanceError && !maintenance ? (
              <div className="alert-dev alert-dev-danger mb-0">
                <Icon name="ban" size={16} style={{ marginRight: 6 }} />
                Gagal memuat status maintenance: {maintenanceError}. Pastikan MongoDB dashboard terhubung.
              </div>
            ) : (
              <>
                <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                  <div>
                    <div className="fw-semibold" style={{ fontSize: '0.92rem' }}>
                      {maintenanceOn ? 'Halaman publik ditutup' : 'Situs melayani pengunjung'}
                    </div>
                    <div className="text-muted-dev" style={{ fontSize: '0.78rem' }}>
                      Pengunjung melihat halaman 503 saat maintenance aktif.
                    </div>
                  </div>
                  <label className="dev-switch">
                    <input
                      type="checkbox"
                      checked={maintenanceOn}
                      onChange={(e) => saveMaintenance({ toggle: true, next: e.target.checked })}
                      disabled={saving}
                    />
                    <span className="track" />
                  </label>
                </div>

                {/* Teks halaman maintenance */}
                <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                  Teks Halaman Maintenance
                </div>
                <div className="d-flex flex-column gap-3">
                  <div>
                    <label className="dev-label" htmlFor="maint-title">Judul</label>
                    <input
                      id="maint-title"
                      className="dev-input"
                      value={text.title}
                      maxLength={80}
                      onChange={(e) => setText({ ...text, title: e.target.value })}
                      placeholder="Under Maintenance"
                    />
                  </div>
                  <div>
                    <label className="dev-label" htmlFor="maint-message">Pesan</label>
                    <input
                      id="maint-message"
                      className="dev-input"
                      value={text.message}
                      maxLength={300}
                      onChange={(e) => setText({ ...text, message: e.target.value })}
                      placeholder="Website sedang diperbaiki, coba kembali nanti"
                    />
                  </div>
                  <div>
                    <label className="dev-label" htmlFor="maint-footer">Footer</label>
                    <input
                      id="maint-footer"
                      className="dev-input"
                      value={text.footer}
                      maxLength={80}
                      onChange={(e) => setText({ ...text, footer: e.target.value })}
                      placeholder="— tim gpieluzaikids"
                    />
                  </div>
                </div>

                <div className="d-flex gap-2 mt-3">
                  <button
                    className="btn-dev btn-dev-primary flex-fill"
                    onClick={() => saveMaintenance()}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Icon name="check" size={16} />
                        Simpan Teks
                      </>
                    )}
                  </button>
                  <button
                    className="btn-dev flex-fill"
                    onClick={() => saveMaintenance({ toggle: true, next: !maintenanceOn })}
                    disabled={saving}
                    style={
                      maintenanceOn
                        ? { background: 'var(--dev-red-soft)', color: 'var(--dev-red)', fontWeight: 600 }
                        : { background: 'var(--dev-blue)', color: '#fff' }
                    }
                  >
                    {maintenanceOn ? (
                      <>
                        <Icon name="check" size={16} />
                        Nonaktifkan
                      </>
                    ) : (
                      <>
                        <Icon name="alert" size={16} />
                        Aktifkan
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Preview */}
        <div className="col-lg-7">
          <Card
            title="Preview Website Utama"
            sub={maintenanceOn ? 'Maintenance aktif — yang tampil adalah halaman pemeliharaan.' : 'Tampilan halaman utama saat ini.'}
            icon="globe"
            actions={
              <button className="btn-dev btn-dev-ghost btn-sm-dev" onClick={loadPreview} disabled={previewLoading}>
                <Icon name="refresh" size={14} className={previewLoading ? 'spin' : ''} />
                {previewLoading ? 'Memuat...' : 'Segarkan'}
              </button>
            }
          >
            <div className="preview-bar">
              <span className="status-dot dot-green" />
              <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {SITE_URL}/
              </span>
              <span className="ms-auto">
                {preview && <StatusPill tone={preview.status === 503 ? 'amber' : 'green'}>HTTP {preview.status}</StatusPill>}
              </span>
            </div>
            <div className="preview-body">
              {previewError ? (
                <div className="text-center py-5" style={{ border: '1px solid var(--dev-border)', borderTop: 'none' }}>
                  <Icon name="ban" size={28} style={{ color: 'var(--dev-red)' }} />
                  <div className="fw-semibold mt-2">Preview tidak tersedia</div>
                  <div className="text-muted-dev" style={{ fontSize: '0.82rem' }}>
                    {previewError} Pastikan website utama dapat diakses di <span className="mono">{SITE_URL}</span>.
                  </div>
                  <button className="btn-dev btn-dev-outline btn-sm-dev mt-3" onClick={loadPreview}>
                    <Icon name="refresh" size={14} />
                    Coba Lagi
                  </button>
                </div>
              ) : previewLoading ? (
                <Spinner label="Mengambil halaman website utama..." />
              ) : preview?.html ? (
                // sandbox tanpa allow-scripts → preview statis (skrip sudah
                // dihapus di server); tampilan akurat seperti website asli.
                <iframe
                  title="Preview website utama"
                  className="preview-frame"
                  sandbox=""
                  srcDoc={injectBase(preview.html, SITE_URL)}
                />
              ) : null}
            </div>
            <div className="d-flex justify-content-end mt-3">
              <a href={`${SITE_URL}/`} target="_blank" rel="noopener noreferrer" className="btn-dev btn-dev-outline btn-sm-dev">
                <Icon name="external" size={14} />
                Buka di Tab Baru
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Lapisan akses maintenance mode (dashboard /dev).
//
// Pola SAMA dengan userRepo.js: menulis LANGSUNG ke database
// MongoDB yang sama dengan website utama (collection
// `runtime_configs` pada MONGODB_URI/MONGODB_DB yang
// dikonfigurasi), sehingga perubahan berlaku real-time di
// website utama — tanpa bergantung pada website utama online
// atau kecocokan kunci DEV_API_KEY.
//
// Struktur dokumen identik dengan D:\church/lib/runtimeState.js:
//   { key: "maintenance", value: { maintenanceMode, blockedIps,
//     blockedDevices, maintenanceTitle, maintenanceMessage,
//     maintenanceFooter } }
// Website utama membaca MongoDB dulu (getStateCached), jadi
// apa pun yang ditulis di sini langsung terbaca di sana.
// ============================================================

import { connectToDatabase } from '@/lib/db';
import RuntimeConfig from '@/database/models/RuntimeConfig';

const DEFAULTS = {
  maintenanceMode: false,
  maintenanceTitle: 'Under Maintenance',
  maintenanceMessage: 'Website sedang diperbaiki, coba kembali nanti',
  maintenanceFooter: '— tim gpieluzaikids',
};

function parseBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

// Baca satu dokumen runtime_config dari MongoDB (timeout singkat —
// DB lambat/offline tidak boleh menggantung request).
async function readMaintenanceDoc() {
  let timer;
  try {
    const conn = await Promise.race([
      connectToDatabase(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
    if (!conn) return null;
    const doc = await RuntimeConfig.findOne({ key: 'maintenance' }).lean().maxTimeMS(1500);
    return doc?.value ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tulis dokumen runtime_config ke MongoDB (upsert, gabungkan dengan
// field lain agar blocklist & teks tidak ikut terhapus).
async function writeMaintenanceDoc(value) {
  let timer;
  try {
    const conn = await Promise.race([
      connectToDatabase(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 3000);
      }),
    ]);
    if (!conn) return false;
    await RuntimeConfig.updateOne(
      { key: 'maintenance' },
      { $set: { value } },
      { upsert: true, maxTimeMS: 2500 }
    );
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function parseState(state) {
  return {
    maintenanceMode: Boolean(state?.maintenanceMode),
    blockedIps: Array.isArray(state?.blockedIps)
      ? state.blockedIps.map((s) => String(s).trim()).filter(Boolean)
      : [],
    blockedDevices: Array.isArray(state?.blockedDevices)
      ? state.blockedDevices.map((s) => String(s).trim()).filter(Boolean)
      : [],
    maintenanceTitle: String(state?.maintenanceTitle || DEFAULTS.maintenanceTitle).slice(0, 80),
    maintenanceMessage: String(state?.maintenanceMessage || DEFAULTS.maintenanceMessage).slice(0, 300),
    maintenanceFooter: String(state?.maintenanceFooter || DEFAULTS.maintenanceFooter).slice(0, 80),
  };
}

// Status maintenance lengkap — bentuk sama dengan /api/dev/status
// website utama agar UI dashboard tidak perlu diubah strukturnya.
export async function getMaintenanceStatus() {
  const doc = await readMaintenanceDoc();
  const state = parseState(doc);
  const envForce = parseBool(process.env.MAINTENANCE_MODE);
  return {
    enabled: envForce || state.maintenanceMode,
    source: envForce ? 'env' : state.maintenanceMode ? 'runtime' : 'none',
    title: state.maintenanceTitle,
    message: state.maintenanceMessage,
    footer: state.maintenanceFooter,
  };
}

// Ubah maintenance mode (on/off) — tulis langsung ke MongoDB.
// Catatan: env MAINTENANCE_MODE dibaca dari proses dashboard ini;
// force-on di env website utama tidak bisa dimatikan dari sini (sama
// seperti website utama yang membaca env-nya sendiri).
export async function setMaintenanceMode(enabled) {
  // Saat dokumen pertama kali dibuat, seed teks default agar website
  // utama (yang membaca MongoDB lebih dulu lalu fallback file) tetap
  // melihat teks yang konsisten, bukan default dari file lokalnya.
  const current = (await readMaintenanceDoc()) || {
    maintenanceTitle: DEFAULTS.maintenanceTitle,
    maintenanceMessage: DEFAULTS.maintenanceMessage,
    maintenanceFooter: DEFAULTS.maintenanceFooter,
  };
  const ok = await writeMaintenanceDoc({ ...current, maintenanceMode: Boolean(enabled) });
  if (!ok) throw new Error('Gagal menyimpan maintenance ke MongoDB. Periksa koneksi MONGODB_URI.');
  return getMaintenanceStatus();
}

// Ubah teks halaman maintenance — tulis langsung ke MongoDB.
export async function setMaintenanceText({ title, message, footer } = {}) {
  const patch = {};
  if (title !== undefined) patch.maintenanceTitle = String(title).slice(0, 80);
  if (message !== undefined) patch.maintenanceMessage = String(message).slice(0, 300);
  if (footer !== undefined) patch.maintenanceFooter = String(footer).slice(0, 80);

  const current = (await readMaintenanceDoc()) || {};
  const ok = await writeMaintenanceDoc({ ...current, ...patch });
  if (!ok) throw new Error('Gagal menyimpan teks maintenance ke MongoDB. Periksa koneksi MONGODB_URI.');
  return getMaintenanceStatus();
}

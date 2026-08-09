// ============================================================
// Validasi Absensi — konstanta & validator bersama
// (pola sama dengan website utama D:\church/lib/attendanceValidation.js).
// Dipakai oleh model Mongoose (database/models) dan UI.
// ============================================================

// Kelas Sekolah Minggu — urutan ini dipakai di kartu admin & export.
export const CLASSES = [
  { value: 'baby', label: 'Baby' },
  { value: 'samuel', label: 'Samuel' },
  { value: 'yosua', label: 'Yosua' },
  { value: 'musa', label: 'Musa' },
];

export const CLASS_VALUES = CLASSES.map((c) => c.value);

export function classLabel(value) {
  return CLASSES.find((c) => c.value === value)?.label || value || '';
}

export function isValidClass(value) {
  return CLASS_VALUES.includes(value);
}

export const MEMBER_NAME_MAX = 80;

// Nama anggota — wajib, 1–80 karakter.
export function isValidMemberName(name) {
  const n = String(name || '').trim();
  return n.length > 0 && n.length <= MEMBER_NAME_MAX;
}

// Entri absensi: { memberId, name, present }.
// name disimpan sebagai snapshot saat pengisian agar riwayat tidak
// berubah ketika anggota diubah/dihapus nanti.
export function isValidAttendanceEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return false;
  return entries.every(
    (e) =>
      e &&
      typeof e === 'object' &&
      typeof e.present === 'boolean' &&
      isValidMemberName(e.name)
  );
}

export function normalizeAttendanceEntries(entries) {
  return (entries || [])
    .map((e) => ({
      memberId: String(e.memberId || ''),
      name: String(e.name || '').trim().slice(0, MEMBER_NAME_MAX),
      present: Boolean(e.present),
    }))
    .filter((e) => e.name.length > 0);
}

// ============================================================
// Helper tanggal (murni JS — aman dipakai server & client)
// ============================================================

// "Hari ini" dalam zona WAKTU LOKAL (bukan UTC) — penting di jam 00:00–07:00
// dini hari (UTC+7) agar Minggu terdekat tidak melompat ke minggu depan.
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Hari Minggu terdekat (≥ hari ini; hari ini bila hari ini Minggu).
export function nextSundayDate(dateStr) {
  const d = new Date(`${dateStr || ''}T00:00:00`);
  if (Number.isNaN(d.getTime())) d.setTime(Date.now());
  const diff = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Label Indonesia panjang: "Minggu, 9 Agustus 2026".
export function formatSundayLabel(dateStr) {
  const d = new Date(`${dateStr || ''}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr || '';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

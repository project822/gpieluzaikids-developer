// ============================================================
// Konstanta Absensi — pola sama dengan website utama
// (D:\church/lib/attendanceValidation.js). Hanya berisi konstanta
// kelas yang dipakai model Mongoose (database/models); validator
// & helper tanggal dijalankan di website utama.
// ============================================================

// Kelas Sekolah Minggu — urutan ini dipakai di kartu admin & export.
export const CLASSES = [
  { value: 'baby', label: 'Baby' },
  { value: 'samuel', label: 'Samuel' },
  { value: 'yosua', label: 'Yosua' },
  { value: 'musa', label: 'Musa' },
];

export const CLASS_VALUES = CLASSES.map((c) => c.value);

import mongoose from 'mongoose';

// Jadwal kegiatan mingguan — SATU dokumen per tanggal (wajib hari Minggu).
// Field datar (bukan nested) agar kompatibel dengan ResourceManager admin.
const ScheduleSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD (hari Minggu)
    ibadahAda: { type: Boolean, default: true }, // ada/tidak Ibadah Sekolah Minggu
    ibadahTime: { type: String, default: '' }, // waktu MULAI saja (tanpa rentang)
    latihanAda: { type: Boolean, default: false }, // ada/tidak Latihan
    latihanTime: { type: String, default: '' }, // waktu MULAI saja
  },
  { timestamps: true }
);

export default mongoose.models.Schedule || mongoose.model('Schedule', ScheduleSchema);

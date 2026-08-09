import mongoose from 'mongoose';
import { CLASS_VALUES } from '@/lib/attendanceValidation';

// Entri absensi satu anak — nama disimpan sebagai SNAPSHOT saat pengisian
// agar riwayat tetap utuh meski anggota diubah/dihapus kemudian.
const AttendanceEntrySchema = new mongoose.Schema(
  {
    memberId: { type: String, default: '' },
    name: { type: String, default: '' },
    present: { type: Boolean, default: false },
  },
  { _id: false }
);

// Absensi mingguan — SATU dokumen per (kelas, tanggal Minggu).
// Diperbarui (upsert) bila admin mengisi ulang kelas yang sama pada tanggal sama.
const AttendanceSchema = new mongoose.Schema(
  {
    className: { type: String, required: true, enum: CLASS_VALUES },
    date: { type: String, required: true }, // YYYY-MM-DD (wajib Hari Minggu)
    entries: { type: [AttendanceEntrySchema], default: [] },
  },
  { timestamps: true }
);

AttendanceSchema.index({ className: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);

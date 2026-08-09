import mongoose from 'mongoose';
import { CLASS_VALUES } from '@/lib/attendanceValidation';

// Anggota tiap kelas Sekolah Minggu (Baby, Samuel, Yosua, Musa).
// Data ini menjadi daftar yang dipakai saat mengisi absensi mingguan.
const ClassMemberSchema = new mongoose.Schema(
  {
    className: { type: String, required: true, enum: CLASS_VALUES, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.ClassMember || mongoose.model('ClassMember', ClassMemberSchema);

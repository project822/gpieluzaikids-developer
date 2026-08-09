import mongoose from 'mongoose';

// Log aktivitas admin (audit trail konten) — dicatat setiap kali admin
// menambah/mengubah/menghapus konten (event, banner, jadwal, anggota,
// absensi) beserta username pelaku.
const ActivityLogSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // event | banner | schedule | member | attendance | auth | system
    module: { type: String, required: true },
    // create | update | delete | login | clear | ...
    action: { type: String, required: true },
    detail: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

ActivityLogSchema.index({ at: -1 });

export default mongoose.models.ActivityLog || mongoose.model('ActivityLog', ActivityLogSchema);

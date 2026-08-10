// Runtime config — menyimpan state runtime (maintenance mode, teks
// maintenance, blocked IP) di MongoDB agar bisa diubah real-time dari
// dashboard /dev (Vercel).
// Format: { _id: "maintenance" | "blockedIps", value: { ... } }
import mongoose from 'mongoose';

const RuntimeConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.RuntimeConfig || mongoose.model('RuntimeConfig', RuntimeConfigSchema);

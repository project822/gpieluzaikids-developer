import mongoose from 'mongoose';

// User admin multi-user — dibaca saat login (sumber utama), dibuat lewat
// endpoint /api/dev/users (project /dev) atau ditulis langsung ke database
// oleh project /dev. Password disimpan sebagai hash scrypt (lib/auth.js).
// lastLoginAt/lastLoginIp diisi saat login berhasil (dilihat dashboard /dev).
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    passwordHash: { type: String, required: true }, // format scrypt$<salt-hex>$<hash-hex>
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model('User', UserSchema);

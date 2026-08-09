import mongoose from 'mongoose';

const EventItemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    theme: { type: String, default: '' },
    date: { type: String, required: true },
    openGate: { type: String, default: '' },
    time: { type: String, default: '' },
    location: { type: String, default: '' },
    mapsLink: { type: String, default: '' },
    formLink: { type: String, default: '' },
    photoLink: { type: String, default: '' },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    // Sembunyikan dari halaman publik tanpa menghapus data (retensi manual).
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.EventItem || mongoose.model('EventItem', EventItemSchema);

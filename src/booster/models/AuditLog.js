import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, default: null },
  action:  { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ guildId: 1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export default mongoose.model('BoosterAuditLog', schema);

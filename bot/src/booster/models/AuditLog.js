import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  userId:   { type: String, required: true },
  action:   { type: String, required: true },
  details:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ guildId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', schema);

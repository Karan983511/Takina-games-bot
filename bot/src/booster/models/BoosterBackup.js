import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  userId:   { type: String, required: true },
  roleData: { type: mongoose.Schema.Types.Mixed, default: null },
  vcData:   { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });
schema.index({ guildId: 1, userId: 1 });
export default mongoose.model('BoosterBackup', schema);

import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:       { type: String, required: true },
  userId:        { type: String, required: true },
  channelId:     { type: String, default: null },
  name:          { type: String, required: true },
  userLimit:     { type: Number, default: 0 },
  bitrate:       { type: Number, default: 64000 },
  parentId:      { type: String, default: null },
  active:        { type: Boolean, default: true },
  softDeletedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ guildId: 1, userId: 1 });
schema.index({ guildId: 1, channelId: 1 });
export default mongoose.model('BoosterVC', schema);

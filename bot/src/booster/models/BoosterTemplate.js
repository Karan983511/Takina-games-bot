import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:     { type: String, default: null },
  name:        { type: String, required: true },
  color:       { type: String, required: true },
  description: { type: String, default: '' },
  emoji:       { type: String, default: '\u{1f3a8}' },
  builtIn:     { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ guildId: 1 });
export default mongoose.model('BoosterTemplate', schema);

import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  active:   { type: Boolean, default: true },
  endsAt:   { type: Date, required: true },
  votes:    { type: [{ userId: String, roleId: String }], default: [] },
  winnerId: { type: String, default: null },
}, { timestamps: true });
schema.index({ guildId: 1, active: 1 });
export default mongoose.model('VoteSession', schema);

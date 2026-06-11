import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:      { type: String, required: true },
  roleId:       { type: String, required: true },
  userId:       { type: String, required: true },
  roleName:     { type: String, required: true },
  featuredAt:   { type: Date, default: Date.now },
  unfeaturedAt: { type: Date, default: null },
  wonByVote:    { type: Boolean, default: false },
  voteCount:    { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ guildId: 1 });
export default mongoose.model('FeaturedHistory', schema);

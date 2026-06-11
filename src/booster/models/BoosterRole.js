import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId:        { type: String, required: true },
  userId:         { type: String, required: true },
  roleId:         { type: String, default: null },
  name:           { type: String, required: true },
  color:          { type: String, default: '#99AAB5' },
  colorSecondary: { type: String, default: null },   // Bug fix: persist gradient second color
  iconType:       { type: String, enum: ['none', 'emoji', 'custom', 'image'], default: 'none' },
  icon:           { type: String, default: null },   // unicode char, <:name:id>, or null for image
  template:       { type: String, default: null },
  sharedWith:     { type: [String], default: [] },
  featured:       { type: Boolean, default: false },
  active:         { type: Boolean, default: true },
  softDeletedAt:  { type: Date, default: null },
}, { timestamps: true });
schema.index({ guildId: 1, userId: 1 });
schema.index({ guildId: 1, roleId: 1 });
schema.index({ guildId: 1, active: 1 });
export default mongoose.model('BoosterRole', schema);

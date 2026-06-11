import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  features: {
    customRoles:       { type: Boolean, default: true },
    roleSharing:       { type: Boolean, default: true },
    customVC:          { type: Boolean, default: true },
    softDeleteRestore: { type: Boolean, default: true },
    roleTemplates:     { type: Boolean, default: true },
    roleBackup:        { type: Boolean, default: true },
    dashboard:         { type: Boolean, default: true },
  },
  boundaries: {
    upperRoleId: { type: String, default: null },
    lowerRoleId: { type: String, default: null },
  },
  logChannelId: { type: String, default: null },
}, { timestamps: true });
schema.index({ guildId: 1 });
export default mongoose.model('BoosterSettings', schema);

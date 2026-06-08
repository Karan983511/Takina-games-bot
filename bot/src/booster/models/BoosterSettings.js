import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  features: {
    customRoles:   { type: Boolean, default: true },
    roleSharing:   { type: Boolean, default: true },
    roleTemplates: { type: Boolean, default: true },
  },

  eligibilityRoleId: { type: String, default: null },

  boundaries: {
    upperRoleId: { type: String, default: null },
    lowerRoleId: { type: String, default: null },
  },

  rotation: {
    enabled:               { type: Boolean, default: false },
    frequency:             { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly', 'custom'], default: 'daily' },
    customIntervalMinutes: { type: Number, default: 1440 },
  },

  retention: {
    days: { type: Number, default: 7, min: 1, max: 365 },
  },

  logChannelId: { type: String, default: null },
}, { timestamps: true });

schema.index({ guildId: 1 });

export default mongoose.model('BoosterSettings', schema);

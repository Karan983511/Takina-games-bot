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
    weeklyRotation:    { type: Boolean, default: false },
    featuredVoting:    { type: Boolean, default: true },
    hallOfFame:        { type: Boolean, default: true },
    dashboard:         { type: Boolean, default: true },
  },

  boundaries: {
    upperRoleId: { type: String, default: null },
    lowerRoleId: { type: String, default: null },
  },

  rotation: {
    enabled:               { type: Boolean, default: false },
    // Boundary/position rotation (keeps roles inside bounds)
    frequency:             { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly', 'custom'], default: 'daily' },
    customIntervalMinutes: { type: Number, default: 1440 },
    // Featured rotation (random pick every N days)
    interval: { type: Number, default: 7 },
    lastRun:  { type: Date, default: null },
    nextRun:  { type: Date, default: null },
  },

  voting: {
    enabled:         { type: Boolean, default: true },
    sessionDuration: { type: Number, default: 3 },
    lastRun:         { type: Date, default: null },
  },

  retention: {
    days: { type: Number, default: 7, min: 1, max: 365 },
  },

  logChannelId:   { type: String, default: null },
  requiredRoleId: { type: String, default: null },
}, { timestamps: true });

schema.index({ guildId: 1 });
export default mongoose.model('BoosterSettings', schema);

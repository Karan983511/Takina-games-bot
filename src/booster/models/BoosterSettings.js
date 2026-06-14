import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  features: {
    customRoles:    { type: Boolean, default: true },
    roleSharing:    { type: Boolean, default: true },
    roleTemplates:  { type: Boolean, default: true },
    gracePeriodDms: { type: Boolean, default: true },
  },

  eligibilityRoleId: { type: String, default: null },

  boundaries: {
    upperRoleId: { type: String, default: null },
    lowerRoleId: { type: String, default: null },
  },

  rotation: {
    enabled:               { type: Boolean, default: false },
    mode:                  { type: String, enum: ['sequential', 'random'], default: 'sequential' },
    frequency:             { type: String, enum: ['hourly', 'daily', 'weekly', 'monthly', 'custom'], default: 'daily' },
    customIntervalMinutes: { type: Number, default: 1440 },
    lastRunAt:             { type: Date, default: null },
    scheduledHour:         { type: Number, default: 0, min: 0, max: 23 },
    scheduledMinute:       { type: Number, default: 0, min: 0, max: 59 },
    timezone:              { type: String, default: 'UTC' },
    nextRotationAt:        { type: Date, default: null },
  },

  retention: {
    days: { type: Number, default: 7, min: 1, max: 365 },
  },

  gracePeriod: {
    enabled: { type: Boolean, default: true },
    days:    { type: Number, default: 3, min: 0, max: 30 },
  },

  logChannelId: { type: String, default: null },
}, { timestamps: true });


export default mongoose.model('BoosterSettings', schema);

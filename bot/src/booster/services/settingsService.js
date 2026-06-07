import BoosterSettings from '../models/BoosterSettings.js';
import BoosterTemplate  from '../models/BoosterTemplate.js';

const BUILT_IN_TEMPLATES = [
  { name: 'Sunset',       color: '#FF6B35', emoji: '\u{1f305}', description: 'Warm orange-red sunset glow',  builtIn: true },
  { name: 'Ocean',        color: '#00B4D8', emoji: '\u{1f30a}', description: 'Deep ocean blue',               builtIn: true },
  { name: 'Emerald',      color: '#2DC653', emoji: '\u{1f49a}', description: 'Rich emerald green',            builtIn: true },
  { name: 'Royal Purple', color: '#7B2D8B', emoji: '\u{1f451}', description: 'Deep royal purple',             builtIn: true },
  { name: 'Gold',         color: '#FFD700', emoji: '\u{2728}',  description: 'Shimmering gold',               builtIn: true },
  { name: 'Cyber Blue',   color: '#00F5FF', emoji: '\u{26a1}',  description: 'Electric cyber blue',           builtIn: true },
  { name: 'Sakura Pink',  color: '#FF9EB5', emoji: '\u{1f338}', description: 'Soft sakura blossom pink',      builtIn: true },
];

export async function getSettings(guildId) {
  return BoosterSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}

export function isEnabled(settings, feature) {
  return settings?.features?.[feature] !== false;
}

export async function seedTemplates() {
  const existing = await BoosterTemplate.countDocuments({ builtIn: true });
  if (existing > 0) return;
  await BoosterTemplate.insertMany(BUILT_IN_TEMPLATES);
}

export async function getTemplates(guildId) {
  return BoosterTemplate.find({ $or: [{ guildId: null }, { guildId }] }).lean();
}

export async function getTemplate(guildId, name) {
  const n = name.toLowerCase();
  const all = await getTemplates(guildId);
  return all.find(t => t.name.toLowerCase() === n) ?? null;
}

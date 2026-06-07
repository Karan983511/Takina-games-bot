import BoosterSettings from '../models/BoosterSettings.js';

export async function isInBoundary(guild, role) {
  const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();
  if (!settings?.boundaries?.upperRoleId || !settings?.boundaries?.lowerRoleId) return true;
  const upper = guild.roles.cache.get(settings.boundaries.upperRoleId);
  const lower = guild.roles.cache.get(settings.boundaries.lowerRoleId);
  if (!upper || !lower) return true;
  const min = Math.min(upper.position, lower.position);
  const max = Math.max(upper.position, lower.position);
  return role.position >= min && role.position <= max;
}

export async function getInsertPosition(guild) {
  const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();
  if (!settings?.boundaries?.upperRoleId) return 1;
  const upper = guild.roles.cache.get(settings.boundaries.upperRoleId);
  return upper ? upper.position - 1 : 1;
}

export async function assertBoundary(guild, role) {
  const ok = await isInBoundary(guild, role);
  if (!ok) throw new Error(`Role "${role.name}" is outside the configured boundary. Operation refused.`);
}

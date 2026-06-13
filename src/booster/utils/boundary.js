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

/**
 * Returns the position for a newly created bot role — just above the lower
 * boundary (bottom of the stack), so new roles enter at the bottom:
 *
 *   ── Upper boundary ──
 *     Role A  (oldest / been rotated up)
 *     Role B
 *     Role C
 *     New Role  ← inserted here, just above lower boundary
 *   ── Lower boundary ──
 *
 * Falls back to just below the upper boundary if only the upper boundary
 * is configured (no lower boundary set).
 */
export async function getInsertPosition(guild) {
  const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();

  const lower = settings?.boundaries?.lowerRoleId
    ? guild.roles.cache.get(settings.boundaries.lowerRoleId)
    : null;

  if (lower) {
    // Place just above the lower boundary (bottom of the boundary stack).
    return lower.position + 1;
  }

  // Fallback: no lower boundary configured — place just below the upper boundary.
  const upper = settings?.boundaries?.upperRoleId
    ? guild.roles.cache.get(settings.boundaries.upperRoleId)
    : null;

  return upper ? upper.position - 1 : 1;
}

export async function assertBoundary(guild, role) {
  const ok = await isInBoundary(guild, role);
  if (!ok) throw new Error(`Role "${role.name}" is outside the configured boundary. Operation refused.`);
}

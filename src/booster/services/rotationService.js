import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { log } from '../utils/logger.js';

let _client = null;
const _timers = new Map(); // guildId → NodeJS.Timeout

export function startRotationService(client) {
  _client = client;
  log('info', 'RotationService', '✅ Started');

  // Guilds aren't cached until after login — wait for ready before scheduling.
  if (client.isReady()) {
    _scheduleAll();
  } else {
    client.once('ready', () => _scheduleAll());
  }
}

export function stopRotationService() {
  for (const t of _timers.values()) clearTimeout(t);
  _timers.clear();
}

/** Called from /bsetup when rotation settings change for a specific guild. */
export async function rescheduleGuild(guildId) {
  if (_timers.has(guildId)) { clearTimeout(_timers.get(guildId)); _timers.delete(guildId); }
  await _scheduleGuild(guildId);
}

async function _scheduleAll() {
  if (!_client) return;
  for (const [guildId] of _client.guilds.cache) {
    await _scheduleGuild(guildId).catch(() => {});
  }
}

async function _scheduleGuild(guildId) {
  const settings = await BoosterSettings.findOne({ guildId }).lean().catch(() => null);
  if (!settings?.rotation?.enabled) return;

  const ms    = _freqToMs(settings.rotation.frequency, settings.rotation.customIntervalMinutes);
  const timer = setTimeout(async () => {
    await runRotationForGuild(guildId);
    _scheduleGuild(guildId); // reschedule
  }, ms);

  _timers.set(guildId, timer);
  log('info', 'RotationService', `Scheduled rotation for guild ${guildId} in ${Math.round(ms / 60000)}min`);
}

function _freqToMs(freq, customMinutes) {
  switch (freq) {
    case 'hourly':  return 60 * 60 * 1000;
    case 'daily':   return 24 * 60 * 60 * 1000;
    case 'weekly':  return 7  * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    case 'custom':  return Math.max(30, customMinutes ?? 1440) * 60 * 1000;
    default:        return 24 * 60 * 60 * 1000;
  }
}

/**
 * Cycles bot-tracked roles within the boundary one step downward:
 *
 *   Before:              After:
 *   ─ Upper boundary ─   ─ Upper boundary ─
 *     Role 1               Role 2
 *     Role 2               Role 3
 *     Role 3               Role 1   ← was at top, now at bottom
 *   ─ Lower boundary ─   ─ Lower boundary ─
 *
 * Only roles that belong to the bot (stored in BoosterRole) are moved.
 * Unrelated server roles are never touched.
 */
export async function runRotationForGuild(guildId) {
  try {
    const guild = _client?.guilds?.cache?.get(guildId);
    if (!guild) return;

    // Only bot-tracked roles.
    const botRoles = await BoosterRole.find({ guildId, active: true }).lean();
    if (!botRoles.length) return;

    const settings  = await BoosterSettings.findOne({ guildId }).lean();
    const upperRole = settings?.boundaries?.upperRoleId
      ? guild.roles.cache.get(settings.boundaries.upperRoleId)
      : null;
    const lowerRole = settings?.boundaries?.lowerRoleId
      ? guild.roles.cache.get(settings.boundaries.lowerRoleId)
      : null;

    if (!upperRole || !lowerRole) {
      log('warn', 'RotationService', `Guild ${guildId}: boundaries not configured, skipping rotation`);
      return;
    }

    // Use Math.min/max so it works regardless of which role the admin set as "upper"/"lower".
    const minPos = Math.min(upperRole.position, lowerRole.position); // lower boundary position
    const maxPos = Math.max(upperRole.position, lowerRole.position); // upper boundary position

    // Resolve Discord role objects for each tracked bot role, keep only those inside the boundary.
    const rolesInBounds = botRoles
      .map(doc => ({ doc, discordRole: guild.roles.cache.get(doc.roleId) }))
      .filter(({ discordRole }) => (
        discordRole &&
        discordRole.position > minPos &&   // strictly inside — above lower boundary
        discordRole.position < maxPos      // strictly inside — below upper boundary
      ))
      .sort((a, b) => b.discordRole.position - a.discordRole.position); // highest pos first = top of list

    if (rolesInBounds.length < 2) {
      log('info', 'RotationService', `Guild ${guildId}: fewer than 2 bot roles in bounds, nothing to rotate`);
      return;
    }

    // The role at the TOP (highest position number = just below upper boundary).
    const { discordRole: topRole, doc: topDoc } = rolesInBounds[0];

    // Move it to the BOTTOM: one step above the lower boundary.
    const bottomTarget = minPos + 1;

    await topRole.setPosition(bottomTarget);

    log('info', 'RotationService', `Rotated "${topDoc.name}" (${topRole.id}) to bottom in guild ${guildId}`);

    // Post to log channel if configured.
    if (settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');
        const remaining = rolesInBounds.slice(1).map(r => `<@&${r.discordRole.id}>`).join('\n');
        ch.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔄 Role Rotation')
            .setDescription(
              `**Moved to bottom:** <@&${topRole.id}>\n\n` +
              `**New order (top → bottom):**\n${remaining}\n<@&${topRole.id}>`
            )
            .setTimestamp()],
        }).catch(() => {});
      }
    }
  } catch (err) {
    log('error', 'RotationService', `Error for guild ${guildId}: ${err.message}`);
  }
}

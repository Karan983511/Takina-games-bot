import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { log } from '../utils/logger.js';

let _client = null;
const _timers = new Map();

export function startRotationService(client) {
  _client = client;
  log('info', 'RotationService', '✅ Started');
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
    _scheduleGuild(guildId);
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
 * Runs one rotation cycle for a guild.
 *
 * Sequential mode (default):
 *   ── Upper boundary ──      ── Upper boundary ──
 *     Role 1  (top)    →        Role 2
 *     Role 2           →        Role 3
 *     Role 3  (bottom) →        Role 1  ← moved to bottom
 *   ── Lower boundary ──      ── Lower boundary ──
 *
 * Random mode:
 *   A random bot role inside the boundary is picked and moved to the top
 *   (just below the upper boundary), giving it a fresh "featured" position.
 */
export async function runRotationForGuild(guildId) {
  try {
    const guild = _client?.guilds?.cache?.get(guildId);
    if (!guild) return;

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
      log('warn', 'RotationService', `Guild ${guildId}: boundaries not configured, skipping`);
      return;
    }

    const minPos = Math.min(upperRole.position, lowerRole.position);
    const maxPos = Math.max(upperRole.position, lowerRole.position);

    // Only bot-tracked roles strictly inside the boundary.
    const rolesInBounds = botRoles
      .map(doc => ({ doc, discordRole: guild.roles.cache.get(doc.roleId) }))
      .filter(({ discordRole }) =>
        discordRole &&
        discordRole.position > minPos &&
        discordRole.position < maxPos
      )
      .sort((a, b) => b.discordRole.position - a.discordRole.position); // highest pos first = top

    if (rolesInBounds.length < 2) {
      log('info', 'RotationService', `Guild ${guildId}: fewer than 2 bot roles in bounds, skipping`);
      return;
    }

    const mode = settings?.rotation?.mode ?? 'sequential';
    let movedRole, targetPosition, logDescription;

    if (mode === 'random') {
      // Pick a random role (avoid picking the one already at top to prevent no-ops).
      const candidates = rolesInBounds.length > 2
        ? rolesInBounds.slice(1)   // exclude the current top
        : rolesInBounds;           // only 2 roles — pick from both
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      movedRole      = pick.discordRole;
      targetPosition = maxPos - 1; // move it to just below upper boundary (top of stack)
      logDescription =
        `**Mode:** 🎲 Random\n` +
        `**Moved to top:** <@&${movedRole.id}>`;
    } else {
      // Sequential: top role → bottom.
      movedRole      = rolesInBounds[0].discordRole;
      targetPosition = minPos + 1; // move to just above lower boundary (bottom of stack)
      const newOrder = [
        ...rolesInBounds.slice(1).map(r => `<@&${r.discordRole.id}>`),
        `<@&${movedRole.id}>`,
      ].join('\n');
      logDescription =
        `**Mode:** 🔁 Sequential\n` +
        `**Moved to bottom:** <@&${movedRole.id}>\n\n` +
        `**New order (top → bottom):**\n${newOrder}`;
    }

    await movedRole.setPosition(targetPosition).catch((err) => {
      log('error', 'RotationService', `setPosition failed for ${movedRole.id}: ${err.message}`);
    });

    log('info', 'RotationService', `[${mode}] Rotated "${movedRole.name}" in guild ${guildId}`);

    if (settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');
        ch.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔄 Role Rotation')
            .setDescription(logDescription)
            .setTimestamp()],
        }).catch(() => {});
      }
    }
  } catch (err) {
    log('error', 'RotationService', `Error for guild ${guildId}: ${err.message}`);
  }
}

import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { getInsertPosition } from '../utils/boundary.js';
import { log } from '../utils/logger.js';

let _client = null;
const _timers = new Map(); // guildId → NodeJS.Timeout

export function startRotationService(client) {
  _client = client;
  log('info', 'RotationService', '✅ Started');

  // FIX: guilds aren't cached until after login — wait for ready before scheduling.
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

export async function runRotationForGuild(guildId) {
  try {
    const guild = _client?.guilds?.cache?.get(guildId);
    if (!guild) return;

    // Only roles the bot created and tracks — never touches unrelated server roles.
    const botRoles = await BoosterRole.find({ guildId, active: true }).lean();
    if (!botRoles.length) return;

    const settings  = await BoosterSettings.findOne({ guildId }).lean();
    const upperRole = settings?.boundaries?.upperRoleId ? guild.roles.cache.get(settings.boundaries.upperRoleId) : null;
    const lowerRole = settings?.boundaries?.lowerRoleId ? guild.roles.cache.get(settings.boundaries.lowerRoleId) : null;

    if (!upperRole || !lowerRole) return;

    // FIX: use Math.min/max so boundary order in config doesn't matter,
    // and >= / <= (inclusive) — consistent with boundary.js isInBoundary().
    const minPos = Math.min(upperRole.position, lowerRole.position);
    const maxPos = Math.max(upperRole.position, lowerRole.position);

    let repositioned = 0;

    for (const doc of botRoles) {
      const dr = guild.roles.cache.get(doc.roleId);
      if (!dr) continue;

      const inBounds = dr.position >= minPos && dr.position <= maxPos;
      if (inBounds) continue;

      // FIX: re-read target each iteration so position shifts from previous
      // moves don't cause this role to land at the wrong spot.
      // getInsertPosition queries the DB and reads upperRole.position fresh.
      const target = await getInsertPosition(guild);
      await dr.setPosition(target).catch((err) => {
        log('error', 'RotationService', `setPosition failed for role ${doc.roleId}: ${err.message}`);
      });
      repositioned++;
      log('info', 'RotationService', `Repositioned bot role ${doc.roleId} (${doc.userId}) back into bounds`);
    }

    if (repositioned > 0 && settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');
        ch.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔄 Boundary Rotation')
            .setDescription(`Repositioned **${repositioned}** bot role(s) back within boundaries.`)
            .setTimestamp()],
        }).catch(() => {});
      }
    }

    log('info', 'RotationService', `Rotation complete for ${guildId}: ${repositioned} repositioned`);
  } catch (err) {
    log('error', 'RotationService', `Error for guild ${guildId}: ${err.message}`);
  }
}

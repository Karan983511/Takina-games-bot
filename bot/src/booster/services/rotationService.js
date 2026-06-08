import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { getInsertPosition } from '../utils/boundary.js';
import { log } from '../utils/logger.js';

let _client = null;
const _timers = new Map(); // guildId → NodeJS.Timeout

export function startRotationService(client) {
  _client = client;
  log('info', 'RotationService', '✅ Started');
  _scheduleAll();
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

    const roles = await BoosterRole.find({ guildId, active: true }).lean();
    if (!roles.length) return;

    const settings   = await BoosterSettings.findOne({ guildId }).lean();
    const upperRole  = settings?.boundaries?.upperRoleId ? guild.roles.cache.get(settings.boundaries.upperRoleId) : null;
    const lowerRole  = settings?.boundaries?.lowerRoleId ? guild.roles.cache.get(settings.boundaries.lowerRoleId) : null;

    if (!upperRole || !lowerRole) return;

    const upperPos = upperRole.position;
    const lowerPos = lowerRole.position;
    const target   = await getInsertPosition(guild);

    let repositioned = 0;

    for (const doc of roles) {
      const dr = guild.roles.cache.get(doc.roleId);
      if (!dr) continue;
      const pos = dr.position;
      const inBounds = pos < upperPos && pos > lowerPos;
      if (!inBounds) {
        await dr.setPosition(target).catch(() => {});
        repositioned++;
        log('info', 'RotationService', `Repositioned role ${doc.roleId} for ${doc.userId} back into bounds`);
      }
    }

    if (repositioned > 0 && settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');
        ch.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔄 Boundary Rotation')
            .setDescription(`Repositioned **${repositioned}** role(s) back within boundaries.`)
            .setTimestamp()],
        }).catch(() => {});
      }
    }

    log('info', 'RotationService', `Rotation complete for ${guildId}: ${repositioned} repositioned`);
  } catch (err) {
    log('error', 'RotationService', `Error for guild ${guildId}: ${err.message}`);
  }
}

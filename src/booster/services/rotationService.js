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
    client.once('clientReady', () => _scheduleAll());
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

/**
 * For daily/weekly/monthly: schedules at a fixed wall-clock time in the guild's timezone.
 * For hourly/custom: plain interval.
 */
function _getNextMs(settings) {
  const r    = settings.rotation;
  const freq = r.frequency ?? 'daily';
  if (freq === 'hourly' || freq === 'custom') return _freqToMs(freq, r.customIntervalMinutes);

  const hour   = r.scheduledHour   ?? 0;
  const minute = r.scheduledMinute ?? 0;
  const tz     = r.timezone        ?? 'UTC';
  const now    = Date.now();
  const advDays = freq === 'weekly' ? 7 : freq === 'monthly' ? 30 : 1;

  function tzTimeToUTCMs(baseMs) {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(baseMs);
    const [y, mo, d] = dateParts.split('-').map(Number);
    const tentative = Date.UTC(y, mo - 1, d, hour, minute);
    const fp = {};
    for (const { type, value } of new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    }).formatToParts(tentative)) fp[type] = value;
    const hr          = fp.hour === '24' ? 0 : +fp.hour;
    const displayedUTC = Date.UTC(+fp.year, +fp.month - 1, +fp.day, hr, +fp.minute, +(fp.second ?? 0));
    return tentative + (tentative - displayedUTC);
  }

  let candidate = tzTimeToUTCMs(now);
  if (candidate <= now + 30_000) candidate = tzTimeToUTCMs(now + advDays * 86_400_000);
  return Math.max(1000, candidate - now);
}

async function _scheduleGuild(guildId) {
  const settings = await BoosterSettings.findOne({ guildId }).lean().catch(() => null);
  if (!settings?.rotation?.enabled) return;

  const ms       = _getNextMs(settings);
  const nextTime = new Date(Date.now() + ms);

  // Persist so .role overview can display accurate ETA without recomputing
  await BoosterSettings.findOneAndUpdate({ guildId }, { 'rotation.nextRotationAt': nextTime }).catch(() => {});

  const timer = setTimeout(async () => {
    await runRotationForGuild(guildId);
    _scheduleGuild(guildId);
  }, ms);

  _timers.set(guildId, timer);
  log('info', 'RotationService', `Scheduled rotation for guild ${guildId} in ${Math.round(ms / 60000)}min (next: ${nextTime.toISOString()})`);
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

function freqLabel(freq, customMinutes) {
  switch (freq) {
    case 'hourly':  return 'Every hour';
    case 'daily':   return 'Every day';
    case 'weekly':  return 'Every week';
    case 'monthly': return 'Every month';
    case 'custom':  return `Every ${customMinutes ?? 1440} minutes`;
    default:        return 'Daily';
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
 *   (just below the upper boundary).
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
    let movedEntry, targetPosition;

    if (mode === 'random') {
      const candidates = rolesInBounds.length > 2
        ? rolesInBounds.slice(1)   // exclude current top to avoid no-op
        : rolesInBounds;
      movedEntry     = candidates[Math.floor(Math.random() * candidates.length)];
      targetPosition = maxPos - 1; // top of stack (just below upper boundary)
    } else {
      movedEntry     = rolesInBounds[0]; // current top role
      targetPosition = minPos + 1;       // bottom of stack (just above lower boundary)
    }

    await movedEntry.discordRole.setPosition(targetPosition).catch((err) => {
      log('error', 'RotationService', `setPosition failed for ${movedEntry.discordRole.id}: ${err.message}`);
    });

    log('info', 'RotationService', `[${mode}] Rotated "${movedEntry.doc.name}" in guild ${guildId}`);

    // Record lastRunAt so settings history is accurate
    await BoosterSettings.findOneAndUpdate({ guildId }, { 'rotation.lastRunAt': new Date() }).catch(() => {});

    // ── Send log message ────────────────────────────────────────────────────
    if (settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');

        // Build the new order list after the move (re-sort after position change).
        const updatedOrder = rolesInBounds.map(({ doc, discordRole }) => {
          const isMoved = discordRole.id === movedEntry.discordRole.id;
          const pos = isMoved ? targetPosition : discordRole.position;
          return { doc, discordRole, pos };
        }).sort((a, b) => b.pos - a.pos);

        const orderLines = updatedOrder.map(({ doc, discordRole }, i) => {
          const isMoved  = discordRole.id === movedEntry.discordRole.id;
          const arrow    = isMoved ? (mode === 'random' ? ' ← moved to top' : ' ← moved to bottom') : '';
          return `${i + 1}. <@&${discordRole.id}> — <@${doc.userId}>${arrow}`;
        });

        const nextMs   = _freqToMs(settings.rotation.frequency, settings.rotation.customIntervalMinutes);
        const nextTime = Math.floor((Date.now() + nextMs) / 1000);

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔄 Rotation Complete')
          .addFields(
            {
              name: 'Mode',
              value: mode === 'random' ? '🎲 Random' : '🔁 Sequential',
              inline: true,
            },
            {
              name: mode === 'random' ? 'Moved to Top' : 'Moved to Bottom',
              value: `<@&${movedEntry.discordRole.id}> — <@${movedEntry.doc.userId}>`,
              inline: true,
            },
            {
              name: 'Next Rotation',
              value: `<t:${nextTime}:R> (<t:${nextTime}:f>)`,
              inline: true,
            },
            {
              name: `New Order (${rolesInBounds.length} roles)`,
              value: orderLines.join('\n'),
              inline: false,
            },
          )
          .setFooter({ text: `Frequency: ${freqLabel(settings.rotation.frequency, settings.rotation.customIntervalMinutes)}` })
          .setTimestamp();

        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (err) {
    log('error', 'RotationService', `Error for guild ${guildId}: ${err.message}`);
  }
}

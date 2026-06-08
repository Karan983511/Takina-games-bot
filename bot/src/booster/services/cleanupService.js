import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { log } from '../utils/logger.js';

let _client = null;
let _timer  = null;

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startCleanupService(client) {
  _client = client;
  _timer  = setInterval(runCleanup, INTERVAL_MS);
  log('info', 'CleanupService', '✅ Started — runs every 24h');
}

export function stopCleanupService() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

export async function runCleanup() {
  if (!_client) return;
  log('info', 'CleanupService', 'Running scheduled cleanup...');

  const guilds = _client.guilds?.cache;
  if (!guilds?.size) return;

  let totalPurged = 0;

  for (const [guildId] of guilds) {
    try {
      const purged = await cleanupGuild(guildId);
      totalPurged += purged;
    } catch (err) {
      log('error', 'CleanupService', `Failed for guild ${guildId}: ${err.message}`);
    }
  }

  log('info', 'CleanupService', `Done — purged ${totalPurged} expired record(s) across all guilds`);
}

async function cleanupGuild(guildId) {
  const settings     = await BoosterSettings.findOne({ guildId }).lean();
  const retentionDays = settings?.retention?.days ?? 7;
  const cutoff        = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Inactive records older than retention period
  const expired = await BoosterRole.find({
    guildId,
    active: false,
    softDeletedAt: { $lt: cutoff },
  }).lean();

  if (!expired.length) return 0;

  const ids = expired.map(d => d._id);
  await BoosterRole.deleteMany({ _id: { $in: ids } });

  // Log to the guild's log channel if configured
  if (settings?.logChannelId && _client) {
    const guild = _client.guilds.cache.get(guildId);
    const ch    = guild?.channels.cache.get(settings.logChannelId);
    if (ch) {
      const { EmbedBuilder } = await import('discord.js');
      ch.send({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🗑️ Automated Cleanup')
          .setDescription(`Permanently deleted **${expired.length}** expired booster record(s) (>${retentionDays} days inactive).`)
          .setTimestamp()],
      }).catch(() => {});
    }
  }

  log('info', 'CleanupService', `Guild ${guildId} — purged ${expired.length} record(s) (retention: ${retentionDays}d)`);
  return expired.length;
}

/**
 * cleanupService.js
 * Periodically hard-deletes booster role documents that have been soft-deleted
 * for longer than the guild's configured retention period.
 */

import BoosterRole     from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { log }         from '../utils/logger.js';

let _client = null;

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startCleanupService(client) {
  _client = client;
  setInterval(() => runCleanup(), CLEANUP_INTERVAL_MS);
  runCleanup(); // run immediately on start
  log('info', 'CleanupService', 'Booster cleanup service started');
}

async function runCleanup() {
  try {
    const allSettings = await BoosterSettings.find({}).lean();

    for (const settings of allSettings) {
      const retentionDays = settings.retention?.days ?? 7;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Find soft-deleted docs older than retention window
      const expired = await BoosterRole.find({
        guildId:      settings.guildId,
        active:       false,
        softDeletedAt: { $lte: cutoff },
      }).lean();

      if (!expired.length) continue;

      for (const doc of expired) {
        // Make sure the Discord role is gone (it should already be, but be safe)
        const guild = _client?.guilds?.cache?.get(settings.guildId);
        if (guild && doc.roleId) {
          const discordRole = guild.roles.cache.get(doc.roleId);
          if (discordRole) {
            await discordRole.delete('Booster retention cleanup').catch(() => {});
          }
        }
        await BoosterRole.deleteOne({ _id: doc._id });
        log('info', 'CleanupService', `Purged expired booster role doc for ${doc.userId} in ${settings.guildId}`);
      }
    }
  } catch (err) {
    log('error', 'CleanupService', `Cleanup run failed: ${err.message}`);
  }
}

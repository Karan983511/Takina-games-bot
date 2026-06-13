/**
 * emojiCleanupService — Sweeps all guilds for orphaned tmpricon emojis on startup.
 *
 * When the bot restarts mid-session, any temp emojis uploaded but not yet saved
 * (or not yet auto-deleted) will stay in the server permanently. This service
 * finds and removes them at boot time.
 */
import { log } from '../utils/logger.js';

/**
 * Sweep a single guild for stale tmpricon emojis and delete them.
 * @param {import('discord.js').Guild} guild
 */
async function sweepGuild(guild) {
  try {
    const emojis = guild.emojis.cache.filter(e => e.name === 'tmpricon');
    if (!emojis.size) return 0;
    let removed = 0;
    for (const [, emoji] of emojis) {
      await guild.emojis.delete(emoji.id, 'Startup sweep — orphaned temp role icon emoji').catch(() => {});
      removed++;
    }
    if (removed > 0) log('info', 'EmojiCleanup', `Swept ${removed} orphaned tmpricon emoji(s) from guild ${guild.id}`);
    return removed;
  } catch (err) {
    log('error', 'EmojiCleanup', `Sweep failed for guild ${guild.id}: ${err.message}`);
    return 0;
  }
}

/**
 * Run the startup sweep across all guilds the bot is in.
 * @param {import('discord.js').Client} client
 */
export async function runStartupEmojiSweep(client) {
  if (!client.guilds?.cache?.size) return;
  log('info', 'EmojiCleanup', `Running startup sweep across ${client.guilds.cache.size} guild(s)...`);
  let total = 0;
  for (const [, guild] of client.guilds.cache) {
    // Ensure emoji cache is populated
    try { await guild.emojis.fetch(); } catch { /* no perms, skip */ }
    total += await sweepGuild(guild);
  }
  if (total > 0) log('info', 'EmojiCleanup', `Startup sweep done — removed ${total} orphaned emoji(s) total`);
}

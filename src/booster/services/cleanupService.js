import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { log } from '../utils/logger.js';

let _client = null;
let _timer  = null;

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startCleanupService(client) {
  _client = client;
  _timer  = setInterval(runCleanup, INTERVAL_MS);
  log('info', 'CleanupService', '\u2705 Started \u2014 runs every 24h');
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

  log('info', 'CleanupService', `Done \u2014 purged ${totalPurged} expired record(s) across all guilds`);
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
          .setTitle('\ud83d\uddd1\ufe0f Automated Cleanup')
          .setDescription(`Permanently deleted **${expired.length}** expired booster record(s) (>${retentionDays} days inactive).`)
          .setTimestamp()],
      }).catch(() => {});
    }
  }

  log('info', 'CleanupService', `Guild ${guildId} \u2014 purged ${expired.length} record(s) (retention: ${retentionDays}d)`);
  return expired.length;
}

// ─── Startup sweep: recover grace periods lost across bot restarts ────────────
// For each role with boostLostAt set:
//   - If grace already expired  → remove role + send DM now
//   - If grace still running    → reschedule the setTimeout for remaining time
export async function runGraceExpirySweep(client) {
  if (!client) return;
  log('info', 'CleanupService', 'Running grace period startup sweep...');

  const { handleBoostLost } = await import('./roleService.js');
  const guilds = client.guilds?.cache;
  if (!guilds?.size) return;

  let expired = 0, resumed = 0;

  for (const [guildId, guild] of guilds) {
    try {
      const settings   = await BoosterSettings.findOne({ guildId }).lean();
      const graceDays  = settings?.gracePeriod?.enabled !== false
        ? (settings?.gracePeriod?.days ?? 3)
        : 0;
      const dmsEnabled = settings?.features?.gracePeriodDms ?? true;
      const retDays    = settings?.retention?.days ?? 7;

      // All roles currently in a grace period (active + boostLostAt set)
      const inGrace = await BoosterRole.find({
        guildId,
        active: true,
        boostLostAt: { $exists: true, $ne: null },
      }).lean();

      for (const doc of inGrace) {
        const graceExpiresAt = new Date(doc.boostLostAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
        const remainingMs    = graceExpiresAt.getTime() - Date.now();

        if (remainingMs <= 0) {
          // ── Grace already expired while the bot was down ──────────────────
          try {
            const member = await guild.members.fetch(doc.userId).catch(() => null);

            if (member?.premiumSince) {
              // They re-boosted while the bot was down — clear grace, keep role
              await BoosterRole.updateOne({ _id: doc._id }, { $set: { boostLostAt: null } });
              log('info', 'CleanupService', `Grace sweep: ${doc.userId} re-boosted while offline, grace cleared`);
              continue;
            }

            // Remove role
            if (settings?.features?.customRoles !== false) {
              await handleBoostLost(guild, doc.userId);
            }
            expired++;
            log('info', 'CleanupService', `Grace sweep: expired grace for ${doc.userId} in ${guildId}`);

            // Send expiry DM
            if (dmsEnabled) {
              try {
                const user = member?.user ?? await client.users.fetch(doc.userId).catch(() => null);
                if (user) {
                  await user.send(
                    `\ud83d\uddd1\ufe0f Your grace period on **${guild.name}** has ended. Your custom role **${doc.name}** has been removed.\n` +
                    `Your settings are saved \u2014 if you boost again within ${retDays} days, use \`.booster restore\` to get your role back.`
                  ).catch(() => {});
                }
              } catch { /* DMs closed */ }
            }

            // Log to channel
            const ch = settings?.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
            ch?.send({ content: `\ud83d\uddd1\ufe0f Grace period expired (offline) \u2014 removed custom role for <@${doc.userId}>.` }).catch(() => {});
          } catch (err) {
            log('error', 'CleanupService', `Grace sweep expiry error for ${doc.userId}: ${err.message}`);
          }
        } else {
          // ── Grace still running — reschedule the timer for remaining time ─
          resumed++;
          const userId  = doc.userId;
          const docName = doc.name;

          const timer = setTimeout(async () => {
            try {
              const freshMember = await guild.members.fetch(userId).catch(() => null);
              if (freshMember?.premiumSince) {
                await BoosterRole.updateOne({ guildId, userId }, { $set: { boostLostAt: null } });
                log('info', 'CleanupService', `Resumed grace timer: ${userId} re-boosted, grace cleared`);
                return;
              }

              const latestSettings = await BoosterSettings.findOne({ guildId }).lean();
              if (latestSettings?.features?.customRoles !== false) {
                await handleBoostLost(guild, userId);
              }
              log('info', 'CleanupService', `Resumed grace timer: expired for ${userId}`);

              if (latestSettings?.features?.gracePeriodDms ?? true) {
                try {
                  const user = freshMember?.user ?? await client.users.fetch(userId).catch(() => null);
                  if (user) {
                    await user.send(
                      `\ud83d\uddd1\ufe0f Your grace period on **${guild.name}** has ended. Your custom role **${docName}** has been removed.\n` +
                      `Your settings are saved \u2014 if you boost again within ${latestSettings?.retention?.days ?? 7} days, use \`.booster restore\` to get your role back.`
                    ).catch(() => {});
                  }
                } catch { /* DMs closed */ }
              }

              const ch = latestSettings?.logChannelId ? guild.channels.cache.get(latestSettings.logChannelId) : null;
              ch?.send({ content: `\ud83d\uddd1\ufe0f Grace period expired \u2014 removed custom role for <@${userId}>.` }).catch(() => {});
            } catch (err) {
              log('error', 'CleanupService', `Resumed grace timer error for ${userId}: ${err.message}`);
            }
          }, remainingMs);
          timer.unref?.();

          log('info', 'CleanupService', `Grace sweep: resumed timer for ${userId} (${Math.round(remainingMs / 60000)}min remaining)`);
        }
      }
    } catch (err) {
      log('error', 'CleanupService', `Grace sweep failed for guild ${guildId}: ${err.message}`);
    }
  }

  log('info', 'CleanupService', `Grace sweep done \u2014 ${expired} expired, ${resumed} timer(s) resumed`);
}

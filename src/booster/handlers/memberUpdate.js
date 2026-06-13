import { handleBoostLost, restoreRole } from '../services/roleService.js';
import { log } from '../utils/logger.js';
import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';

async function getSettings(guildId) {
  return BoosterSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true },
  );
}

// ─── DM helper — swallows all errors so a closed DM never breaks the flow ─────
async function tryDm(user, content) {
  try { await user.send(content); } catch { /* DMs closed */ }
}

// ─── Grace period: mark boostLostAt, DM the user, schedule deletion ───────────
async function startGracePeriod(guild, userId, user, graceDays, client) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc || doc.manuallyLinked) return;

  doc.boostLostAt = new Date();
  await doc.save();
  log('info', 'MemberUpdate', `Grace period started for ${userId} (${graceDays}d)`);

  // DM the user if enabled
  const settings = await getSettings(guild.id);
  const dmsEnabled = settings.features?.gracePeriodDms ?? true;
  if (dmsEnabled) {
    const deadline = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    await tryDm(user,
      `💔 **You've stopped boosting ${guild.name}.**\n\n` +
      `Your custom role **${doc.name}** is still active and will be kept for **${graceDays} day${graceDays !== 1 ? 's' : ''}** ` +
      `(until **${deadlineStr}**). If you boost again before then, nothing will change.\n\n` +
      `After ${deadlineStr}, your role will be automatically removed and your settings saved for 7 more days.`
    );
  }

  // Schedule actual deletion
  const delayMs = graceDays * 24 * 60 * 60 * 1000;
  const timer = setTimeout(async () => {
    try {
      const freshMember = await guild.members.fetch(userId).catch(() => null);
      if (freshMember?.premiumSince) {
        log('info', 'MemberUpdate', `Grace expired for ${userId} — they re-boosted, skipping deletion`);
        await BoosterRole.updateOne({ guildId: guild.id, userId }, { $set: { boostLostAt: null } });
        return;
      }
      const latestSettings = await getSettings(guild.id);
      if (latestSettings.features.customRoles) {
        await handleBoostLost(guild, userId);
      }
      log('info', 'MemberUpdate', `Grace period expired — removed role for ${userId}`);
      if (latestSettings.features?.gracePeriodDms ?? true) {
        await tryDm(user,
          `🗑️ Your grace period on **${guild.name}** has ended. Your custom role **${doc.name}** has been removed.\n` +
          `Your settings are saved — if you boost again within 7 days, use \`.booster restore\` to get your role back.`
        );
      }
      const ch = latestSettings.logChannelId ? guild.channels.cache.get(latestSettings.logChannelId) : null;
      ch?.send({ content: `🗑️ Grace period expired — removed custom role for <@${userId}>.` }).catch(() => {});
    } catch (err) {
      log('error', 'MemberUpdate', `Grace period expiry error for ${userId}: ${err.message}`);
    }
  }, delayMs);
  timer.unref?.();
}

export async function handleBoostChange(oldMember, newMember, client) {
  if (!!oldMember.premiumSince === !!newMember.premiumSince) return;

  const { guild, id: userId } = newMember;
  const settings = await getSettings(guild.id);

  // ── Boost lost ────────────────────────────────────────────────────────────
  if (oldMember.premiumSince && !newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} lost boost in ${guild.id}`);

    const stillEligible = settings.eligibilityRoleId
      ? newMember.roles.cache.has(settings.eligibilityRoleId)
      : false;

    if (!stillEligible && settings.features.customRoles) {
      const graceDays = settings.gracePeriod?.enabled !== false
        ? (settings.gracePeriod?.days ?? 3)
        : 0;

      if (graceDays > 0) {
        await startGracePeriod(guild, userId, newMember.user, graceDays, client).catch(err =>
          log('error', 'MemberUpdate', `startGracePeriod failed for ${userId}: ${err.message}`)
        );
      } else {
        // Grace disabled — delete immediately (original behavior)
        await handleBoostLost(guild, userId).catch(err =>
          log('error', 'MemberUpdate', `handleBoostLost failed for ${userId}: ${err.message}`)
        );
      }
    }

    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    const graceDays = settings.gracePeriod?.enabled !== false ? (settings.gracePeriod?.days ?? 3) : 0;
    ch?.send({
      content: stillEligible
        ? `💔 <@${userId}> stopped boosting but still has the eligibility role — custom role preserved.`
        : graceDays > 0
          ? `💔 <@${userId}> stopped boosting — **${graceDays}-day grace period** started. Role removed after grace expires.`
          : `💔 <@${userId}> stopped boosting — custom role removed immediately.`,
    }).catch(() => {});
  }

  // ── Boost gained ─────────────────────────────────────────────────────────
  if (!oldMember.premiumSince && newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} gained boost in ${guild.id}`);

    // Clear grace period if they come back
    const doc = await BoosterRole.findOne({ guildId: guild.id, userId });
    if (doc?.boostLostAt) {
      doc.boostLostAt = null;
      await doc.save();
      log('info', 'MemberUpdate', `Cleared grace period for ${userId} — re-boosted`);
    }

    let restored = null;
    if (settings.features.customRoles) {
      // Only auto-restore if role is inactive (was deleted); if still active (in grace), it's fine as-is
      const activeRole = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
      if (!activeRole) {
        restored = await restoreRole(guild, userId).catch(err => {
          log('error', 'MemberUpdate', `restoreRole failed for ${userId}: ${err.message}`);
          return null;
        });
      }
    }

    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({
      content: `💎 <@${userId}> is boosting again! ${restored ? '✅ Custom role automatically restored.' : 'No previous role found — use `.role setup` to create one.'}`,
    }).catch(() => {});
  }
}

export async function handleEligibilityLost(member) {
  const { guild, id: userId } = member;
  const settings = await getSettings(guild.id);
  if (member.premiumSince) return;
  if (settings.features.customRoles) {
    await handleBoostLost(guild, userId).catch(err =>
      log('error', 'MemberUpdate', `handleEligibilityLost failed for ${userId}: ${err.message}`)
    );
  }
  log('info', 'MemberUpdate', `${userId} lost eligibility role — custom role removed`);
  const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
  ch?.send({
    content: `💔 <@${userId}> lost the eligibility role — custom role removed. Data preserved for **${settings.retention?.days ?? 7} days**.`,
  }).catch(() => {});
}

export async function handleMemberLeave(member) {
  const { guild, id: userId } = member;
  try {
    const doc = await BoosterRole.findOne({ guildId: guild.id, userId });
    if (!doc) return;
    log('info', 'MemberUpdate', `Member ${userId} left — preserving role data`);
    if (doc.active) {
      await handleBoostLost(guild, userId).catch(() => {});
      await BoosterRole.updateOne(
        { guildId: guild.id, userId },
        { $set: { leftGuildAt: new Date() } },
      );
    } else {
      doc.leftGuildAt = new Date();
      await doc.save();
    }
  } catch (err) {
    log('error', 'MemberUpdate', `handleMemberLeave error for ${userId}: ${err.message}`);
  }
}

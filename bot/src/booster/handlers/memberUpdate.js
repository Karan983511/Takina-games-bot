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

export async function handleBoostChange(oldMember, newMember, client) {
  if (!!oldMember.premiumSince === !!newMember.premiumSince) return;

  const { guild, id: userId } = newMember;
  const settings = await getSettings(guild.id);

  if (oldMember.premiumSince && !newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} lost boost in ${guild.id}`);

    const stillEligible = settings.eligibilityRoleId
      ? newMember.roles.cache.has(settings.eligibilityRoleId)
      : false;

    if (!stillEligible && settings.features.customRoles) {
      await handleBoostLost(guild, userId).catch(err =>
        log('error', 'MemberUpdate', `handleBoostLost failed for ${userId}: ${err.message}`)
      );
    }

    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({
      content: stillEligible
        ? `💔 <@${userId}> stopped boosting but still has the eligibility role — custom role preserved.`
        : `💔 <@${userId}> stopped boosting — custom role removed. Data preserved for **${settings.retention?.days ?? 7} days**.`,
    }).catch(() => {});
  }

  if (!oldMember.premiumSince && newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} gained boost in ${guild.id}`);

    let restored = null;
    if (settings.features.customRoles) {
      restored = await restoreRole(guild, userId).catch(err => {
        log('error', 'MemberUpdate', `restoreRole failed for ${userId}: ${err.message}`);
        return null;
      });
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

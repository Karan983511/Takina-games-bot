import { softDeleteRole, restoreRole } from '../services/roleService.js';
import { softDeleteVC, restoreVC }     from '../services/vcService.js';
import { getSettings, isEnabled }      from '../services/settingsService.js';
import { audit, log }                  from '../utils/logger.js';
import BoosterRole                     from '../models/BoosterRole.js';

// ─── Boost gained / lost ──────────────────────────────────────────────────────

export async function handleBoostChange(oldMember, newMember, client) {
  const { guild, id: userId } = newMember;

  const wasBooster = !!oldMember.premiumSince;
  const isBooster  = !!newMember.premiumSince;

  // If boost status didn't change, check for required role loss instead
  if (wasBooster === isBooster) {
    await checkRequiredRoleLoss(oldMember, newMember, client).catch(err =>
      log('error', 'MemberUpdate', `Required-role check failed for ${userId}: ${err.message}`)
    );
    return;
  }

  const settings = await getSettings(guild.id);

  // ── Boost lost ───────────────────────────────────────────────────────────────
  if (wasBooster && !isBooster) {
    log('info', 'MemberUpdate', `${userId} lost boost in ${guild.id}`);
    if (isEnabled(settings, 'customRoles')) await softDeleteRole(guild, userId).catch(() => {});
    if (isEnabled(settings, 'customVC'))    await softDeleteVC(guild, userId).catch(() => {});
    await audit(client, guild.id, userId, 'BOOST_LOST', {});
    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({
      content: `💔 <@${userId}> stopped boosting — role & VC deactivated (data kept for restore).`,
    }).catch(() => {});
  }

  // ── Boost gained ─────────────────────────────────────────────────────────────
  if (!wasBooster && isBooster) {
    log('info', 'MemberUpdate', `${userId} gained boost in ${guild.id}`);
    if (!isEnabled(settings, 'softDeleteRestore')) return;
    const r  = await restoreRole(guild, userId).catch(() => null);
    const vc = await restoreVC(guild, userId).catch(() => null);
    await audit(client, guild.id, userId, 'BOOST_GAINED', { roleRestored: !!r, vcRestored: !!vc });
    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({
      content: `💎 <@${userId}> is boosting again! ${r ? '✅ Role restored.' : ''} ${vc ? '✅ VC restored.' : ''}`,
    }).catch(() => {});
  }
}

// ─── Required role enforcement ────────────────────────────────────────────────

async function checkRequiredRoleLoss(oldMember, newMember, client) {
  const { guild, id: userId } = newMember;
  const settings = await getSettings(guild.id);

  if (!settings.requiredRoleId) return;

  const hadRole = oldMember.roles.cache.has(settings.requiredRoleId);
  const hasRole = newMember.roles.cache.has(settings.requiredRoleId);

  // Only act when they just LOST the required role
  if (!hadRole || hasRole) return;

  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) return;

  log('info', 'MemberUpdate', `${userId} lost required role ${settings.requiredRoleId} in ${guild.id} — soft-deleting booster role`);

  await softDeleteRole(guild, userId).catch(err =>
    log('error', 'MemberUpdate', `softDeleteRole (required-role loss) failed for ${userId}: ${err.message}`)
  );

  await audit(client, guild.id, userId, 'REQUIRED_ROLE_LOST', {
    requiredRoleId: settings.requiredRoleId,
  }).catch(() => {});

  const retentionDays = settings.retention?.days ?? 7;
  const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
  ch?.send({
    content: `⚠️ <@${userId}> lost the required role <@&${settings.requiredRoleId}> — custom booster role removed. Data is preserved for **${retentionDays} day(s)** and will be restored if the role is returned.`,
  }).catch(() => {});
}

// ─── Member left guild ────────────────────────────────────────────────────────

export async function handleMemberLeave(member) {
  const { guild, id: userId } = member;
  try {
    const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
    if (!doc) return;

    log('info', 'MemberUpdate', `${userId} left guild ${guild.id} — marking booster role as left`);

    // Remove the Discord role from all who have it
    if (doc.roleId) {
      const discordRole = guild.roles.cache.get(doc.roleId);
      if (discordRole) {
        for (const m of guild.members.cache.values()) {
          if (m.roles.cache.has(doc.roleId)) {
            await m.roles.remove(discordRole).catch(() => {});
          }
        }
      }
    }

    doc.active      = false;
    doc.softDeletedAt = doc.softDeletedAt ?? new Date();
    doc.leftGuildAt   = new Date();
    await doc.save();
  } catch (err) {
    log('error', 'MemberUpdate', `handleMemberLeave failed for ${userId} in ${guild.id}: ${err.message}`);
  }
}

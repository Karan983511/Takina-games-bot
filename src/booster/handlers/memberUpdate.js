import { softDeleteRole, restoreRole } from '../services/roleService.js';
import { softDeleteVC, restoreVC }     from '../services/vcService.js';
import { getSettings, isEnabled }      from '../services/settingsService.js';
import { audit, log }                  from '../utils/logger.js';

export async function handleBoostChange(oldMember, newMember, client) {
  if (!!oldMember.premiumSince === !!newMember.premiumSince) return;
  const { guild, id: userId } = newMember;
  const settings = await getSettings(guild.id);

  if (oldMember.premiumSince && !newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} lost boost in ${guild.id}`);
    if (isEnabled(settings,'customRoles')) await softDeleteRole(guild, userId).catch(() => {});
    if (isEnabled(settings,'customVC'))    await softDeleteVC(guild, userId).catch(() => {});
    await audit(client, guild.id, userId, 'BOOST_LOST', {});
    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({ content: `💔 <@${userId}> stopped boosting — role & VC deactivated (data kept for restore).` }).catch(() => {});
  }

  if (!oldMember.premiumSince && newMember.premiumSince) {
    log('info', 'MemberUpdate', `${userId} gained boost in ${guild.id}`);
    if (!isEnabled(settings,'softDeleteRestore')) return;
    const r  = await restoreRole(guild, userId).catch(() => null);
    const vc = await restoreVC(guild, userId).catch(() => null);
    await audit(client, guild.id, userId, 'BOOST_GAINED', { roleRestored: !!r, vcRestored: !!vc });
    const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
    ch?.send({ content: `💎 <@${userId}> is boosting again! ${r ? '✅ Role restored.' : ''} ${vc ? '✅ VC restored.' : ''}` }).catch(() => {});
  }
}

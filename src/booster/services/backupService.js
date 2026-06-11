import BoosterBackup from '../models/BoosterBackup.js';
import BoosterRole   from '../models/BoosterRole.js';
import BoosterVC     from '../models/BoosterVC.js';

export async function createBackup(guildId, userId) {
  const role = await BoosterRole.findOne({ guildId, userId }).lean();
  const vc   = await BoosterVC.findOne({ guildId, userId }).lean();
  const roleData = role ? { name: role.name, color: role.color, icon: role.icon, template: role.template, sharedWith: role.sharedWith, active: role.active } : null;
  const vcData   = vc   ? { name: vc.name, userLimit: vc.userLimit, bitrate: vc.bitrate, parentId: vc.parentId, active: vc.active } : null;
  return BoosterBackup.findOneAndUpdate({ guildId, userId }, { $set: { roleData, vcData } }, { upsert: true, new: true });
}

export async function getBackup(guildId, userId) {
  return BoosterBackup.findOne({ guildId, userId }).lean();
}

export async function exportBackupJSON(guildId, userId) {
  const backup = await getBackup(guildId, userId);
  if (!backup) return null;
  return JSON.stringify({ guildId, userId, roleData: backup.roleData, vcData: backup.vcData, savedAt: backup.updatedAt }, null, 2);
}

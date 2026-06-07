import BoosterRole from '../models/BoosterRole.js';
import { getInsertPosition, assertBoundary } from '../utils/boundary.js';
import { log } from '../utils/logger.js';

export async function createBoosterRole(guild, userId, { name, color, icon, template }) {
  const position = await getInsertPosition(guild);
  const roleData = { name, color: color || '#99AAB5', hoist: false, mentionable: false, position };
  if (icon) roleData.icon = icon;
  const discordRole = await guild.roles.create(roleData);
  log('info', 'RoleService', `Created role ${discordRole.id} (${name}) for ${userId}`);
  const doc = await BoosterRole.findOneAndUpdate(
    { guildId: guild.id, userId },
    { $set: { roleId: discordRole.id, name, color: color || '#99AAB5', icon: icon || null, template: template || null, active: true, softDeletedAt: null } },
    { upsert: true, new: true }
  );
  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.add(discordRole).catch(() => {});
  return { doc, discordRole };
}

export async function editBoosterRole(guild, userId, updates) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) throw new Error('No active booster role found.');
  const discordRole = guild.roles.cache.get(doc.roleId);
  if (!discordRole) throw new Error('Discord role no longer exists. Try `.booster restore`.');
  await assertBoundary(guild, discordRole);
  const patch = {};
  if (updates.name)  { patch.name  = updates.name;  doc.name  = updates.name;  }
  if (updates.color) { patch.color = updates.color;  doc.color = updates.color; }
  if (updates.icon !== undefined) { patch.icon = updates.icon; doc.icon = updates.icon; }
  await discordRole.edit(patch);
  await doc.save();
  return { doc, discordRole };
}

export async function softDeleteRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) return null;
  const discordRole = guild.roles.cache.get(doc.roleId);
  if (discordRole) {
    for (const m of guild.members.cache.values())
      if (m.roles.cache.has(doc.roleId)) await m.roles.remove(discordRole).catch(() => {});
  }
  doc.active = false; doc.softDeletedAt = new Date(); await doc.save();
  log('info', 'RoleService', `Soft-deleted role for ${userId}`);
  return doc;
}

export async function restoreRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: false });
  if (!doc) return null;
  const position  = await getInsertPosition(guild);
  const roleData  = { name: doc.name, color: doc.color, hoist: false, mentionable: false, position };
  if (doc.icon) roleData.icon = doc.icon;
  const discordRole = await guild.roles.create(roleData).catch(() => null);
  if (!discordRole) return null;
  doc.roleId = discordRole.id; doc.active = true; doc.softDeletedAt = null; await doc.save();
  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.add(discordRole).catch(() => {});
  for (const sharedId of doc.sharedWith) {
    const sm = guild.members.cache.get(sharedId) ?? await guild.members.fetch(sharedId).catch(() => null);
    if (sm) await sm.roles.add(discordRole).catch(() => {});
  }
  log('info', 'RoleService', `Restored role for ${userId}`);
  return { doc, discordRole };
}

export async function deleteBoosterRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId });
  if (!doc) return null;
  if (doc.roleId) {
    const dr = guild.roles.cache.get(doc.roleId);
    if (dr) await dr.delete().catch(() => {});
  }
  await BoosterRole.deleteOne({ _id: doc._id });
  return doc;
}

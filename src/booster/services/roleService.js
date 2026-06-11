import BoosterRole from '../models/BoosterRole.js';
import { getInsertPosition, assertBoundary } from '../utils/boundary.js';
import { log } from '../utils/logger.js';

export async function createBoosterRole(guild, userId, { name, color, icon, template }) {
  const position  = await getInsertPosition(guild);
  const roleData  = { name, color: color || '#99AAB5', hoist: false, mentionable: false };
  if (icon) roleData.icon = icon;

  const discordRole = await guild.roles.create(roleData);
  await discordRole.setPosition(position).catch(() => {});
  log('info', 'RoleService', `Created role ${discordRole.id} (${name}) for ${userId}`);

  const doc = await BoosterRole.findOneAndUpdate(
    { guildId: guild.id, userId },
    {
      $set: {
        roleId:        discordRole.id,
        name,
        color:         color || '#99AAB5',
        icon:          icon  || null,
        template:      template || null,
        active:        true,
        manuallyLinked: false,
        softDeletedAt: null,
        leftGuildAt:   null,
      },
    },
    { upsert: true, new: true },
  );

  const member = guild.members.cache.get(userId)
               ?? await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.add(discordRole).catch(() => {});

  return { doc, discordRole };
}

export async function editBoosterRole(guild, userId, updates) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) throw new Error('No active booster role found.');

  const discordRole = guild.roles.cache.get(doc.roleId);
  if (!discordRole) throw new Error('Discord role no longer exists. Try restoring.');

  await assertBoundary(guild, discordRole);

  const patch = {};
  if (updates.name  !== undefined) { patch.name  = updates.name;  doc.name  = updates.name;  }
  if (updates.color !== undefined) { patch.color = updates.color; doc.color = updates.color; }
  if (updates.icon  !== undefined) { patch.icon  = updates.icon;  doc.icon  = updates.icon;  }

  await discordRole.edit(patch);
  await doc.save();
  return { doc, discordRole };
}

/**
 * Admin-only: link a manually created Discord role to a member's booster profile.
 * Once linked the member can use .role give / .role remove on it.
 */
export async function linkExistingRole(guild, userId, roleId) {
  const discordRole = guild.roles.cache.get(roleId);
  if (!discordRole) throw new Error('That role was not found in this server.');

  const member = guild.members.cache.get(userId)
               ?? await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error('That member was not found in this server.');

  const existing = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (existing && !existing.manuallyLinked) {
    throw new Error('This member already has a bot-managed booster role. Have them delete it first with `.role delete`.');
  }

  const doc = await BoosterRole.findOneAndUpdate(
    { guildId: guild.id, userId },
    {
      $set: {
        roleId,
        name:           discordRole.name,
        color:          discordRole.hexColor ?? '#99AAB5',
        active:         true,
        manuallyLinked: true,
        softDeletedAt:  null,
        leftGuildAt:    null,
      },
    },
    { upsert: true, new: true },
  );

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(discordRole).catch(() => {});
  }

  log('info', 'RoleService', `Admin linked role ${roleId} (${discordRole.name}) to ${userId}`);
  return { doc, discordRole };
}

/**
 * Admin-only: remove a manually linked role from the booster system.
 * Does NOT delete the Discord role — the admin keeps full control of it.
 */
export async function unlinkRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, manuallyLinked: true, active: true });
  if (!doc) throw new Error('No manually linked role found for that member.');

  await BoosterRole.deleteOne({ _id: doc._id });
  log('info', 'RoleService', `Admin unlinked role ${doc.roleId} from ${userId}`);
  return doc;
}

/**
 * Called when a member LOSES boost.
 * Deletes the Discord role from the server entirely.
 * Preserves the DB record (name, color, icon, sharedWith) for auto-restoration later.
 */
export async function handleBoostLost(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) return null;

  // Manually linked roles are admin-managed — don't auto-delete them on boost loss
  if (doc.manuallyLinked) {
    log('info', 'RoleService', `Boost lost for ${userId} but role is manually linked — skipping auto-delete`);
    return null;
  }

  const discordRole = guild.roles.cache.get(doc.roleId);
  if (discordRole) {
    for (const memberId of [...doc.sharedWith, userId]) {
      const m = guild.members.cache.get(memberId)
             ?? await guild.members.fetch(memberId).catch(() => null);
      if (m) await m.roles.remove(discordRole).catch(() => {});
    }
    await discordRole.delete('Booster lost boost').catch(() => {});
  }

  doc.active        = false;
  doc.softDeletedAt = new Date();
  doc.roleId        = null;
  await doc.save();

  log('info', 'RoleService', `Boost lost — deleted Discord role for ${userId}, DB data preserved`);
  return doc;
}

export const softDeleteRole = handleBoostLost;

/**
 * Called when a member REGAINS boost.
 * Recreates the Discord role from preserved DB data and reassigns it.
 */
export async function restoreRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: false });
  if (!doc) return null;

  const position  = await getInsertPosition(guild);
  const roleData  = { name: doc.name, color: doc.color, hoist: false, mentionable: false };
  if (doc.icon) roleData.icon = doc.icon;

  const discordRole = await guild.roles.create(roleData).catch(() => null);
  if (!discordRole) return null;
  await discordRole.setPosition(position).catch(() => {});

  doc.roleId        = discordRole.id;
  doc.active        = true;
  doc.softDeletedAt = null;
  doc.leftGuildAt   = null;
  await doc.save();

  const owner = guild.members.cache.get(userId)
              ?? await guild.members.fetch(userId).catch(() => null);
  if (owner) await owner.roles.add(discordRole).catch(() => {});

  for (const sharedId of doc.sharedWith) {
    const sm = guild.members.cache.get(sharedId)
             ?? await guild.members.fetch(sharedId).catch(() => null);
    if (sm) await sm.roles.add(discordRole).catch(() => {});
  }

  log('info', 'RoleService', `Restored role for ${userId} → ${discordRole.id}`);
  return { doc, discordRole };
}

export async function deleteBoosterRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId });
  if (!doc) return null;

  if (doc.roleId) {
    const dr = guild.roles.cache.get(doc.roleId);
    if (dr) {
      for (const memberId of [...doc.sharedWith, userId]) {
        const m = guild.members.cache.get(memberId)
               ?? await guild.members.fetch(memberId).catch(() => null);
        if (m) await m.roles.remove(dr).catch(() => {});
      }
      // Only delete the Discord role if it wasn't manually linked
      if (!doc.manuallyLinked) {
        await dr.delete('Deleted by owner').catch(() => {});
      }
    }
  }

  await BoosterRole.deleteOne({ _id: doc._id });
  log('info', 'RoleService', `Hard-deleted role record for ${userId}`);
  return doc;
}

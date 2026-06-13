import BoosterRole from '../models/BoosterRole.js';
import BoosterSettings from '../models/BoosterSettings.js';
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

  // move role inside boundaries so it joins the rotation pool
  const settings  = await BoosterSettings.findOne({ guildId: guild.id }).lean().catch(() => null);
  const upperRole = settings?.boundaries?.upperRoleId ? guild.roles.cache.get(settings.boundaries.upperRoleId) : null;
  const lowerRole = settings?.boundaries?.lowerRoleId ? guild.roles.cache.get(settings.boundaries.lowerRoleId) : null;

  if (upperRole && lowerRole) {
    const upperPos = upperRole.position;
    const lowerPos = lowerRole.position;
    const inBounds = discordRole.position < upperPos && discordRole.position > lowerPos;

    if (!inBounds) {
      await discordRole.setPosition(lowerPos + 1).catch(() => {});
      log('info', 'RoleService', `Moved linked role ${roleId} into boundary at position ${lowerPos + 1}`);
    }
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

export async function unlinkRole(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, manuallyLinked: true, active: true });
  if (!doc) throw new Error('No manually linked role found for that member.');

  await BoosterRole.deleteOne({ _id: doc._id });
  log('info', 'RoleService', `Admin unlinked role ${doc.roleId} from ${userId}`);
  return doc;
}

export async function handleBoostLost(guild, userId) {
  const doc = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) return null;

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
      if (!doc.manuallyLinked) {
        await dr.delete('Deleted by owner').catch(() => {});
      }
    }
  }

  await BoosterRole.deleteOne({ _id: doc._id });
  log('info', 'RoleService', `Hard-deleted role record for ${userId}`);
  return doc;
}

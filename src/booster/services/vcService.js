import BoosterVC from '../models/BoosterVC.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { log } from '../utils/logger.js';

export async function createBoosterVC(guild, userId, { name, userLimit, parentId }) {
  const opts = {
    name, type: ChannelType.GuildVoice, userLimit: userLimit || 0,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.Connect] },
      { id: userId,   allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
    ],
  };
  if (parentId) opts.parent = parentId;
  const channel = await guild.channels.create(opts);
  log('info', 'VCService', `Created VC ${channel.id} (${name}) for ${userId}`);
  const doc = await BoosterVC.findOneAndUpdate(
    { guildId: guild.id, userId },
    { $set: { channelId: channel.id, name, userLimit: userLimit || 0, parentId: parentId || null, active: true, softDeletedAt: null } },
    { upsert: true, new: true }
  );
  return { doc, channel };
}

export async function softDeleteVC(guild, userId) {
  const doc = await BoosterVC.findOne({ guildId: guild.id, userId, active: true });
  if (!doc) return null;
  const ch = guild.channels.cache.get(doc.channelId);
  if (ch) await ch.delete().catch(() => {});
  doc.active = false; doc.softDeletedAt = new Date(); await doc.save();
  log('info', 'VCService', `Soft-deleted VC for ${userId}`);
  return doc;
}

export async function restoreVC(guild, userId) {
  const doc = await BoosterVC.findOne({ guildId: guild.id, userId, active: false });
  if (!doc) return null;
  const opts = {
    name: doc.name, type: ChannelType.GuildVoice, userLimit: doc.userLimit || 0,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.Connect] },
      { id: userId,   allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
    ],
  };
  if (doc.parentId) opts.parent = doc.parentId;
  const channel = await guild.channels.create(opts).catch(() => null);
  if (!channel) return null;
  doc.channelId = channel.id; doc.active = true; doc.softDeletedAt = null; await doc.save();
  log('info', 'VCService', `Restored VC for ${userId}`);
  return { doc, channel };
}

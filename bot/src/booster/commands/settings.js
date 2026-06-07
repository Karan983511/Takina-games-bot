import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import BoosterSettings from '../models/BoosterSettings.js';
import BoosterTemplate from '../models/BoosterTemplate.js';
import AuditLog        from '../models/AuditLog.js';
import { getSettings, isEnabled, getTemplates } from '../services/settingsService.js';
import { startVoteSession, endVoteSession, getActiveSession } from '../services/voteService.js';
import { isAdmin } from '../utils/validators.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';

const FEATURE_LABELS = {
  customRoles:       '🎨 Custom Roles',
  roleSharing:       '👥 Role Sharing',
  customVC:          '🔊 Custom VC',
  softDeleteRestore: '♻️ Soft Delete/Restore',
  roleTemplates:     '🎭 Role Templates',
  roleBackup:        '💾 Backup/Export',
  weeklyRotation:    '🔄 Weekly Rotation',
  featuredVoting:    '🗳️ Featured Voting',
  hallOfFame:        '🏆 Hall of Fame',
  dashboard:         '📊 Dashboard',
};

function guard(message) {
  const member = message.guild.members.cache.get(message.author.id);
  if (!isAdmin(member)) { message.channel.send({ embeds: [errorEmbed('You need **Manage Guild** permission.')] }); return false; }
  return true;
}

async function panel(message) {
  if (!guard(message)) return;
  const settings = await getSettings(message.guild.id);
  const lines = Object.entries(FEATURE_LABELS).map(([k, label]) => `${settings.features[k] !== false ? '✅' : '❌'} ${label}`);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Booster System Settings')
    .addFields(
      { name: 'Feature Toggles', value: lines.join('\n'), inline: false },
      { name: 'Role Boundaries', value: settings.boundaries.upperRoleId ? `Upper: <@&${settings.boundaries.upperRoleId}> | Lower: <@&${settings.boundaries.lowerRoleId}>` : '⚠️ Not configured — all positions allowed', inline: false },
      { name: 'Weekly Rotation', value: settings.rotation.nextRun ? `Next: <t:${Math.floor(new Date(settings.rotation.nextRun).getTime()/1000)}:R>` : 'Not scheduled', inline: true },
      { name: 'Log Channel',     value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'Not set', inline: true },
    )
    .setFooter({ text: 'Use .settings toggle <feature> to enable/disable features.' }).setTimestamp();
  const featureKeys = Object.keys(FEATURE_LABELS);
  const row1 = new ActionRowBuilder().addComponents(featureKeys.slice(0,5).map(k => new ButtonBuilder().setCustomId(`bsettings_toggle_${k}`).setLabel(FEATURE_LABELS[k].replace(/^\S+\s/,'')).setStyle(settings.features[k]!==false?ButtonStyle.Success:ButtonStyle.Danger)));
  const row2 = new ActionRowBuilder().addComponents(featureKeys.slice(5).map(k => new ButtonBuilder().setCustomId(`bsettings_toggle_${k}`).setLabel(FEATURE_LABELS[k].replace(/^\S+\s/,'')).setStyle(settings.features[k]!==false?ButtonStyle.Success:ButtonStyle.Danger)));
  return message.channel.send({ embeds: [embed], components: [row1, row2] });
}

async function toggle(message, args) {
  if (!guard(message)) return;
  const key = args[0];
  if (!key || !FEATURE_LABELS[key]) return message.channel.send({ embeds: [errorEmbed(`Invalid feature. Options:\n\`${Object.keys(FEATURE_LABELS).join(', ')}\``)] });
  const settings = await getSettings(message.guild.id);
  settings.features[key] = !settings.features[key]; await settings.save();
  await audit(message.client, message.guild.id, message.author.id, 'FEATURE_TOGGLE', { feature: key, enabled: settings.features[key] });
  return message.channel.send({ embeds: [successEmbed(`**${FEATURE_LABELS[key]}** is now ${settings.features[key] ? '✅ enabled' : '❌ disabled'}.`)] });
}

async function boundaries(message, args) {
  if (!guard(message)) return;
  const sub = args[0]?.toLowerCase();
  if (sub === 'set') {
    const roles = message.mentions.roles;
    if (roles.size < 2) return message.channel.send({ embeds: [errorEmbed('Mention two roles: `.settings boundaries set @upper @lower`')] });
    const [upperRole, lowerRole] = roles.first(2);
    const settings = await getSettings(message.guild.id);
    settings.boundaries.upperRoleId = upperRole.id; settings.boundaries.lowerRoleId = lowerRole.id; await settings.save();
    await audit(message.client, message.guild.id, message.author.id, 'BOUNDARIES_SET', { upper: upperRole.id, lower: lowerRole.id });
    return message.channel.send({ embeds: [successEmbed(`Boundaries set:\n• Upper: ${upperRole}\n• Lower: ${lowerRole}`)] });
  }
  const settings = await getSettings(message.guild.id);
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📏 Role Boundaries')
    .setDescription(settings.boundaries.upperRoleId ? `**Upper:** <@&${settings.boundaries.upperRoleId}>\n**Lower:** <@&${settings.boundaries.lowerRoleId}>` : '⚠️ No boundaries set. Use `.settings boundaries set @upper @lower`.')] });
}

async function templates(message, args) {
  if (!guard(message)) return;
  const sub = args[0]?.toLowerCase();
  if (sub === 'list') {
    const list = await getTemplates(message.guild.id);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xF47FFF).setTitle('🎭 Templates').setDescription(list.map(t => `${t.emoji} **${t.name}** — \`${t.color}\` ${t.builtIn?'*(built-in)*':'*(custom)*'}`).join('\n') || 'None.')] });
  }
  if (sub === 'add') {
    const [name, color, ...descParts] = args.slice(1);
    if (!name || !color) return message.channel.send({ embeds: [errorEmbed('Usage: `.settings templates add <name> <#color> [description]`')] });
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return message.channel.send({ embeds: [errorEmbed('Color must be a valid hex code like `#FF6B35`.')] });
    await BoosterTemplate.create({ guildId: message.guild.id, name, color, description: descParts.join(' '), emoji: '🎨', builtIn: false });
    return message.channel.send({ embeds: [successEmbed(`Template **${name}** (${color}) added.`)] });
  }
  if (sub === 'remove') {
    const name = args.slice(1).join(' ');
    const result = await BoosterTemplate.deleteOne({ guildId: message.guild.id, name: { $regex: new RegExp(`^${name}$`,'i') }, builtIn: false });
    return message.channel.send({ embeds: [result.deletedCount ? successEmbed(`Template **${name}** removed.`) : errorEmbed(`Template "${name}" not found or is built-in.`)] });
  }
  return message.channel.send({ embeds: [errorEmbed('Usage: `.settings templates list/add/remove`')] });
}

async function history(message) {
  if (!guard(message)) return;
  const logs = await AuditLog.find({ guildId: message.guild.id }).sort({ createdAt: -1 }).limit(10).lean();
  if (!logs.length) return message.channel.send({ embeds: [errorEmbed('No audit log entries yet.')] });
  const lines = logs.map(l => `\`${l.action}\` — <@${l.userId}> — <t:${Math.floor(new Date(l.createdAt).getTime()/1000)}:R>`);
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Audit Log (last 10)').setDescription(lines.join('\n'))] });
}

async function voteAdmin(message, args) {
  if (!guard(message)) return;
  const sub = args[0]?.toLowerCase();
  if (sub === 'start') {
    const days = parseInt(args[1] ?? '3', 10);
    const session = await startVoteSession(message.guild.id, isNaN(days) ? 3 : days);
    return message.channel.send({ embeds: [successEmbed(`Vote session started! Ends <t:${Math.floor(session.endsAt.getTime()/1000)}:R>.`)] });
  }
  if (sub === 'end') {
    const session = await getActiveSession(message.guild.id);
    if (!session) return message.channel.send({ embeds: [errorEmbed('No active vote session.')] });
    const result = await endVoteSession(message.guild, session);
    const winRole = result.winnerId ? message.guild.roles.cache.get(result.winnerId) : null;
    return message.channel.send({ embeds: [successEmbed(`Vote ended! Winner: **${winRole?.name ?? 'None'}** with ${result.votes} vote(s).`)] });
  }
  return message.channel.send({ embeds: [errorEmbed('Usage: `.settings vote start [days]` or `.settings vote end`')] });
}

async function rotation(message, args) {
  if (!guard(message)) return;
  if (args[0]?.toLowerCase() !== 'set') return message.channel.send({ embeds: [errorEmbed('Usage: `.settings rotation set <days>`')] });
  const days = parseInt(args[1] ?? '', 10);
  if (isNaN(days) || days < 1) return message.channel.send({ embeds: [errorEmbed('Provide a number of days >= 1.')] });
  const settings = await getSettings(message.guild.id);
  settings.rotation.interval = days; settings.rotation.nextRun = new Date(Date.now() + days * 24 * 60 * 60 * 1000); await settings.save();
  return message.channel.send({ embeds: [successEmbed(`Rotation interval set to **${days} day(s)**. Next: <t:${Math.floor(settings.rotation.nextRun.getTime()/1000)}:R>.`)] });
}

async function setLog(message) {
  if (!guard(message)) return;
  const ch = message.mentions.channels.first();
  if (!ch) return message.channel.send({ embeds: [errorEmbed('Mention a channel. Example: `.settings log #logs`')] });
  const settings = await getSettings(message.guild.id);
  settings.logChannelId = ch.id; await settings.save();
  return message.channel.send({ embeds: [successEmbed(`Log channel set to ${ch}.`)] });
}

export async function execute(message, args, client) {
  const sub  = args[0]?.toLowerCase() ?? 'panel';
  const rest = args.slice(1);
  try {
    switch (sub) {
      case 'panel':       return await panel(message);
      case 'toggle':      return await toggle(message, rest);
      case 'boundaries':  return await boundaries(message, rest);
      case 'templates':   return await templates(message, rest);
      case 'history':     return await history(message);
      case 'vote':        return await voteAdmin(message, rest);
      case 'rotation':    return await rotation(message, rest);
      case 'log':         return await setLog(message);
      default: return message.channel.send({ embeds: [errorEmbed(`Unknown subcommand \`${sub}\`. Try \`.help settings\`.`)] });
    }
  } catch (err) {
    console.error('[Settings] Command error:', err);
    return message.channel.send({ embeds: [errorEmbed('Something went wrong.')] });
  }
}

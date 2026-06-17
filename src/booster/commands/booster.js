import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import BoosterRole   from '../models/BoosterRole.js';
import BoosterVC     from '../models/BoosterVC.js';
import { getSettings, isEnabled, getTemplates, getTemplate } from '../services/settingsService.js';
import { createBackup, exportBackupJSON } from '../services/backupService.js';
import { getActiveSession, castVote, getHallOfFame } from '../services/voteService.js';
import { isBooster, isAdmin, normalizeHex } from '../utils/validators.js';
import { errorEmbed, successEmbed, featureDisabledEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { editBoosterRole, softDeleteRole } from '../services/roleService.js';
import { softDeleteVC } from '../services/vcService.js';

async function dashboard(message, client) {
  const { guild, author } = message;
  const settings = await getSettings(guild.id);
  if (!isEnabled(settings, 'dashboard')) return message.channel.send({ embeds: [featureDisabledEmbed('dashboard')] });
  const member  = guild.members.cache.get(author.id) ?? await guild.members.fetch(author.id).catch(() => null);
  const role    = await BoosterRole.findOne({ guildId: guild.id, userId: author.id });
  const vc      = await BoosterVC.findOne({ guildId: guild.id, userId: author.id });
  const session = await getActiveSession(guild.id);
  const embed = new EmbedBuilder()
    .setColor(role?.color ? parseInt(role.color.replace('#',''), 16) : 0xF47FFF)
    .setTitle(`🎁 ${author.username}'s Booster Dashboard`)
    .setThumbnail(author.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '💎 Boosting', value: isBooster(member) ? '✅ Active Booster' : '❌ Not Boosting', inline: true },
      { name: '🎨 Role',     value: role ? (role.active ? `<@&${role.roleId}> (Active)` : '⏸️ Inactive') : '❌ None', inline: true },
      { name: '🔊 VC',       value: vc   ? (vc.active ? `<#${vc.channelId}> (Active)` : '⏸️ Inactive') : '❌ None', inline: true },
      { name: '👥 Sharing',  value: role ? `${role.sharedWith.length} member(s)` : '—', inline: true },
      { name: '🎭 Template', value: role?.template || '—', inline: true },
      { name: '⭐ Featured', value: role?.featured ? '✨ Currently Featured' : '—', inline: true },
      { name: '🗳️ Vote',    value: session ? '✅ Active — use `.booster vote`' : '❌ No active session', inline: false },
    )
    .setFooter({ text: 'Use the buttons below to manage your booster perks.' }).setTimestamp();
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_req_role').setLabel('Request Role').setStyle(ButtonStyle.Primary).setEmoji('🎨').setDisabled(!isEnabled(settings,'customRoles')),
    new ButtonBuilder().setCustomId('booster_req_vc').setLabel('Request VC').setStyle(ButtonStyle.Primary).setEmoji('🔊').setDisabled(!isEnabled(settings,'customVC')),
    new ButtonBuilder().setCustomId('booster_backup').setLabel('Backup').setStyle(ButtonStyle.Secondary).setEmoji('💾').setDisabled(!isEnabled(settings,'roleBackup')),
    new ButtonBuilder().setCustomId('booster_restore').setLabel('Restore').setStyle(ButtonStyle.Secondary).setEmoji('♻️').setDisabled(!isEnabled(settings,'softDeleteRestore')),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_share_list').setLabel('Sharing').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
    new ButtonBuilder().setCustomId('booster_templates').setLabel('Templates').setStyle(ButtonStyle.Secondary).setEmoji('🎭').setDisabled(!isEnabled(settings,'roleTemplates')),
    new ButtonBuilder().setCustomId('booster_vote_btn').setLabel('Vote').setStyle(ButtonStyle.Secondary).setEmoji('🗳️').setDisabled(!isEnabled(settings,'featuredVoting')||!session),
    new ButtonBuilder().setCustomId('booster_export').setLabel('Export').setStyle(ButtonStyle.Secondary).setEmoji('📤').setDisabled(!isEnabled(settings,'roleBackup')),
  );
  return message.channel.send({ embeds: [embed], components: [row1, row2] });
}

async function requestRolePanel(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'customRoles')) return message.channel.send({ embeds: [featureDisabledEmbed('custom roles')] });
  const member = message.guild.members.cache.get(message.author.id) ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!isBooster(member) && !isAdmin(member)) return message.channel.send({ embeds: [errorEmbed('You must be a server booster to request a custom role.')] });
  const existing = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (existing) return message.channel.send({ embeds: [errorEmbed(`You already have a role: <@&${existing.roleId}>. Use \`.booster edit\` to change it.`)] });
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(0xF47FFF).setTitle('🎨 Custom Role Request').setDescription('Click the button below to open the role form.\n\nYou\'ll set your role\'s **name** and **color**.')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('booster_req_role').setLabel('📝 Fill in Role Details').setStyle(ButtonStyle.Primary))],
  });
}

async function requestVCPanel(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'customVC')) return message.channel.send({ embeds: [featureDisabledEmbed('custom voice channels')] });
  const member = message.guild.members.cache.get(message.author.id) ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!isBooster(member) && !isAdmin(member)) return message.channel.send({ embeds: [errorEmbed('You must be a server booster to request a custom VC.')] });
  const existing = await BoosterVC.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (existing) return message.channel.send({ embeds: [errorEmbed(`You already have a VC: <#${existing.channelId}>. Delete it first with \`.booster vc delete\`.`)] });
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🔊 Custom VC Request').setDescription('Click the button below to fill in your voice channel details.')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('booster_req_vc').setLabel('📝 Fill in VC Details').setStyle(ButtonStyle.Primary))],
  });
}

async function shareAdd(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'roleSharing')) return message.channel.send({ embeds: [featureDisabledEmbed('role sharing')] });
  const target = message.mentions.members.first();
  if (!target) return message.channel.send({ embeds: [errorEmbed('Mention a member. Example: `.booster share add @user`')] });
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed('You don\'t have an active custom role.')] });
  if (role.sharedWith.includes(target.id)) return message.channel.send({ embeds: [errorEmbed(`${target.user.username} already has access.`)] });
  role.sharedWith.push(target.id); await role.save();
  const dr = message.guild.roles.cache.get(role.roleId);
  if (dr) await target.roles.add(dr).catch(() => {});
  await audit(message.client, message.guild.id, message.author.id, 'SHARE_ADD', { target: target.id });
  return message.channel.send({ embeds: [successEmbed(`Added ${target.user.username} to your role.`)] });
}

async function shareRemove(message) {
  const target = message.mentions.members.first();
  if (!target) return message.channel.send({ embeds: [errorEmbed('Mention a member.')] });
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed('You don\'t have an active custom role.')] });
  role.sharedWith = role.sharedWith.filter(id => id !== target.id); await role.save();
  const dr = message.guild.roles.cache.get(role.roleId);
  if (dr) await target.roles.remove(dr).catch(() => {});
  await audit(message.client, message.guild.id, message.author.id, 'SHARE_REMOVE', { target: target.id });
  return message.channel.send({ embeds: [successEmbed(`Removed ${target.user.username} from your role.`)] });
}

async function pruneSharedWith(guild, role) {
  if (!role?.sharedWith?.length) return [];
  const discordRole = role.roleId ? guild.roles.cache.get(role.roleId) : null;
  const valid = [];
  for (const id of role.sharedWith) {
    const m = guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
    if (m && (!discordRole || m.roles.cache.has(role.roleId))) valid.push(id);
  }
  if (valid.length !== role.sharedWith.length) {
    role.sharedWith = valid;
    await role.save();
  }
  return valid;
}

async function shareList(message) {
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed('You don\'t have an active custom role.')] });
  const valid = await pruneSharedWith(message.guild, role);
  const names = valid.length ? valid.map(id => `<@${id}>`).join(', ') : 'Nobody added yet.';
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Role Sharing').setDescription(names)] });
}

async function templateList(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'roleTemplates')) return message.channel.send({ embeds: [featureDisabledEmbed('role templates')] });
  const templates = await getTemplates(message.guild.id);
  if (!templates.length) return message.channel.send({ embeds: [errorEmbed('No templates available.')] });
  const embed = new EmbedBuilder().setColor(0xF47FFF).setTitle('🎭 Available Templates')
    .setDescription(templates.map(t => `${t.emoji} **${t.name}** — \`${t.color}\`\n${t.description}`).join('\n\n'))
    .setFooter({ text: 'Apply with: .booster template apply <name>' });
  return message.channel.send({ embeds: [embed] });
}

async function templateApply(message, args) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'roleTemplates')) return message.channel.send({ embeds: [featureDisabledEmbed('role templates')] });
  const name = args.join(' ');
  if (!name) return message.channel.send({ embeds: [errorEmbed('Usage: `.booster template apply <name>`')] });
  const tmpl = await getTemplate(message.guild.id, name);
  if (!tmpl) return message.channel.send({ embeds: [errorEmbed(`Template "${name}" not found. See \`.booster template list\`.`)] });
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed('You don\'t have an active custom role.')] });
  try {
    await editBoosterRole(message.guild, message.author.id, { color: tmpl.color });
    role.template = tmpl.name; await role.save();
    return message.channel.send({ embeds: [successEmbed(`Applied **${tmpl.name}** (${tmpl.color}) to your role.`)] });
  } catch (err) { return message.channel.send({ embeds: [errorEmbed(err.message)] }); }
}

async function edit(message, args) {
  const field = args[0]?.toLowerCase();
  const value = args.slice(1).join(' ');
  if (!field || !value) return message.channel.send({ embeds: [errorEmbed('Usage: `.booster edit name <name>` or `.booster edit color <#hex>`')] });
  let updates = {};
  if (field === 'name') updates.name = value.slice(0, 100);
  else if (field === 'color') {
    const hex = normalizeHex(value);
    if (!hex) return message.channel.send({ embeds: [errorEmbed('Invalid color. Use a hex code like `#FF6B35`.')] });
    updates.color = hex;
  } else return message.channel.send({ embeds: [errorEmbed('Field must be `name` or `color`.')] });
  try {
    const { discordRole } = await editBoosterRole(message.guild, message.author.id, updates);
    return message.channel.send({ embeds: [successEmbed(`Updated your role: ${discordRole}.`)] });
  } catch (err) { return message.channel.send({ embeds: [errorEmbed(err.message)] }); }
}

async function backup(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'roleBackup')) return message.channel.send({ embeds: [featureDisabledEmbed('role backup')] });
  try { await createBackup(message.guild.id, message.author.id); return message.channel.send({ embeds: [successEmbed('Backup saved successfully.')] }); }
  catch (err) { return message.channel.send({ embeds: [errorEmbed(err.message)] }); }
}

async function restore(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'softDeleteRestore')) return message.channel.send({ embeds: [featureDisabledEmbed('restore')] });
  const { restoreRole } = await import('../services/roleService.js');
  const { restoreVC }   = await import('../services/vcService.js');
  const r  = await restoreRole(message.guild, message.author.id);
  const vc = await restoreVC(message.guild, message.author.id);
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('♻️ Restore Results')
    .setDescription([r ? '✅ Role restored' : '— No inactive role', vc ? '✅ VC restored' : '— No inactive VC'].join('\n'))] });
}

async function exportData(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'roleBackup')) return message.channel.send({ embeds: [featureDisabledEmbed('backup/export')] });
  const json = await exportBackupJSON(message.guild.id, message.author.id);
  if (!json) return message.channel.send({ embeds: [errorEmbed('No backup found. Run `.booster backup` first.')] });
  return message.channel.send({ files: [{ attachment: Buffer.from(json,'utf-8'), name: `backup-${message.author.id}.json` }], embeds: [successEmbed('Here is your backup file.')] });
}

async function vote(message, args) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'featuredVoting')) return message.channel.send({ embeds: [featureDisabledEmbed('voting')] });
  const sub = args[0]?.toLowerCase();
  if (sub === 'status') {
    const session = await getActiveSession(message.guild.id);
    if (!session) return message.channel.send({ embeds: [errorEmbed('No active vote session.')] });
    const tally = {};
    for (const v of session.votes) tally[v.roleId] = (tally[v.roleId] ?? 0) + 1;
    const sorted = Object.entries(tally).sort(([,a],[,b]) => b - a);
    const lines = sorted.map(([rid, count]) => { const r = message.guild.roles.cache.get(rid); return `${r ? r.name : rid}: **${count}** vote(s)`; });
    return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('🗳️ Vote Standings').setDescription(lines.join('\n') || 'No votes yet.').setFooter({ text: `Ends: ${session.endsAt.toDateString()} • Total: ${session.votes.length}` })] });
  }
  const session = await getActiveSession(message.guild.id);
  if (!session) return message.channel.send({ embeds: [errorEmbed('No active vote session.')] });
  const roles = await BoosterRole.find({ guildId: message.guild.id, active: true }).lean();
  if (!roles.length) return message.channel.send({ embeds: [errorEmbed('No booster roles to vote for.')] });
  const btns = roles.slice(0, 25).map(r => new ButtonBuilder().setCustomId(`booster_vote_${r.roleId}`).setLabel(r.name.slice(0,80)).setStyle(ButtonStyle.Secondary));
  const rows = [];
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i+5)));
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('🗳️ Vote for a Featured Role').setDescription('Click a role to cast your vote. You can change it any time.')], components: rows.slice(0,5) });
}

async function hof(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings,'hallOfFame')) return message.channel.send({ embeds: [featureDisabledEmbed('Hall of Fame')] });
  const history = await getHallOfFame(message.guild.id, 10);
  if (!history.length) return message.channel.send({ embeds: [errorEmbed('No featured history yet.')] });
  const lines = history.map((h, i) => `**${i+1}.** ${h.roleName} — <@${h.userId}> ${h.wonByVote ? '🗳️' : '🔄'} (${h.voteCount} votes)`);
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 Hall of Fame — Featured Roles').setDescription(lines.join('\n')).setFooter({ text: '🗳️ = voted in  🔄 = auto-rotated' })] });
}

export async function execute(message, args, client) {
  const sub  = args[0]?.toLowerCase() ?? '';
  const rest = args.slice(1);
  try {
    switch (sub) {
      case '': case 'dashboard': return await dashboard(message, client);
      case 'request-role': return await requestRolePanel(message);
      case 'request-vc':   return await requestVCPanel(message);
      case 'edit':         return await edit(message, rest);
      case 'share': {
        const a = rest[0]?.toLowerCase();
        if (a === 'add')    return await shareAdd(message);
        if (a === 'remove') return await shareRemove(message);
        if (a === 'list')   return await shareList(message);
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster share add/remove/list`')] });
      }
      case 'template': {
        const a = rest[0]?.toLowerCase();
        if (a === 'list')  return await templateList(message);
        if (a === 'apply') return await templateApply(message, rest.slice(1));
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster template list` or `.booster template apply <name>`')] });
      }
      case 'backup':  return await backup(message);
      case 'restore': return await restore(message);
      case 'export':  return await exportData(message);
      case 'vote':    return await vote(message, rest);
      case 'hof':     return await hof(message);
      case 'role': if (rest[0]?.toLowerCase() === 'delete') { const r = await softDeleteRole(message.guild, message.author.id); return message.channel.send({ embeds: [r ? successEmbed('Role removed (data kept for restore).') : errorEmbed('No active role found.')] }); }
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster role delete`')] });
      case 'vc': if (rest[0]?.toLowerCase() === 'delete') { const v = await softDeleteVC(message.guild, message.author.id); return message.channel.send({ embeds: [v ? successEmbed('VC removed (data kept for restore).') : errorEmbed('No active VC found.')] }); }
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster vc delete`')] });
      default: return message.channel.send({ embeds: [errorEmbed(`Unknown subcommand \`${sub}\`. Try \`.help booster\`.`)] });
    }
  } catch (err) {
    console.error('[Booster] Command error:', err);
    return message.channel.send({ embeds: [errorEmbed('Something went wrong. Please try again.')] });
  }
}

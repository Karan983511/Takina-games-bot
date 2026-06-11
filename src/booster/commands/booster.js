import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import BoosterRole   from '../models/BoosterRole.js';
import BoosterVC     from '../models/BoosterVC.js';
import BoosterBackup from '../models/BoosterBackup.js';
import { getSettings, isEnabled, getTemplates, getTemplate } from '../services/settingsService.js';
import { createBackup, exportBackupJSON } from '../services/backupService.js';
import { isBooster, isAdmin, normalizeHex } from '../utils/validators.js';
import { errorEmbed, successEmbed, featureDisabledEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { editBoosterRole, softDeleteRole } from '../services/roleService.js';
import { softDeleteVC } from '../services/vcService.js';

async function dashboard(message, client) {
  const { guild, author } = message;
  const settings = await getSettings(guild.id);
  if (!isEnabled(settings, 'dashboard')) return message.channel.send({ embeds: [featureDisabledEmbed('dashboard')] });
  const member = guild.members.cache.get(author.id) ?? await guild.members.fetch(author.id).catch(() => null);
  const [role, vc, backup] = await Promise.all([
    BoosterRole.findOne({ guildId: guild.id, userId: author.id }),
    BoosterVC.findOne({ guildId: guild.id, userId: author.id }),
    BoosterBackup.findOne({ guildId: guild.id, userId: author.id }),
  ]);
  const embed = new EmbedBuilder()
    .setColor(role?.color ? parseInt(role.color.replace('#', ''), 16) : 0xF47FFF)
    .setTitle(`🎁 ${author.username}'s Booster Dashboard`)
    .setThumbnail(author.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '💎 Boosting', value: isBooster(member) ? '✅ Active Booster' : '❌ Not Boosting', inline: true },
      { name: '🎨 Role',     value: role ? (role.active ? `<@&${role.roleId}> (Active)` : '⏸️ Inactive') : '❌ None', inline: true },
      { name: '🔊 VC',       value: vc   ? (vc.active   ? `<#${vc.channelId}> (Active)` : '⏸️ Inactive') : '❌ None', inline: true },
      { name: '👥 Sharing',  value: role ? `${role.sharedWith.length} member(s)` : '—', inline: true },
      { name: '🎭 Template', value: role?.template || '—', inline: true },
      { name: '💾 Backup',   value: backup ? `✅ Saved ${backup.updatedAt.toLocaleDateString()}` : '❌ No backup', inline: true },
    )
    .setFooter({ text: 'Use .role setup to create or edit your custom role.' }).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_req_vc').setLabel('Request VC').setStyle(ButtonStyle.Primary).setEmoji('🔊').setDisabled(!isEnabled(settings, 'customVC')),
    new ButtonBuilder().setCustomId('booster_backup').setLabel('Backup').setStyle(ButtonStyle.Secondary).setEmoji('💾').setDisabled(!isEnabled(settings, 'roleBackup')),
    new ButtonBuilder().setCustomId('booster_restore').setLabel('Restore').setStyle(ButtonStyle.Secondary).setEmoji('♻️').setDisabled(!isEnabled(settings, 'softDeleteRestore')),
    new ButtonBuilder().setCustomId('booster_export').setLabel('Export').setStyle(ButtonStyle.Secondary).setEmoji('📤').setDisabled(!isEnabled(settings, 'roleBackup')),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_share_list').setLabel('Sharing').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
    new ButtonBuilder().setCustomId('booster_templates').setLabel('Templates').setStyle(ButtonStyle.Secondary).setEmoji('🎭').setDisabled(!isEnabled(settings, 'roleTemplates')),
  );
  return message.channel.send({ embeds: [embed], components: [row1, row2] });
}

async function requestVCPanel(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'customVC')) return message.channel.send({ embeds: [featureDisabledEmbed('custom voice channels')] });
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
  if (!isEnabled(settings, 'roleSharing')) return message.channel.send({ embeds: [featureDisabledEmbed('role sharing')] });
  const target = message.mentions.members.first();
  if (!target) return message.channel.send({ embeds: [errorEmbed('Mention a member. Example: `.booster share add @user`')] });
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed("You don't have an active custom role.")] });
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
  if (!role) return message.channel.send({ embeds: [errorEmbed("You don't have an active custom role.")] });
  role.sharedWith = role.sharedWith.filter(id => id !== target.id); await role.save();
  const dr = message.guild.roles.cache.get(role.roleId);
  if (dr) await target.roles.remove(dr).catch(() => {});
  await audit(message.client, message.guild.id, message.author.id, 'SHARE_REMOVE', { target: target.id });
  return message.channel.send({ embeds: [successEmbed(`Removed ${target.user.username} from your role.`)] });
}

async function shareList(message) {
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed("You don't have an active custom role.")] });
  const names = role.sharedWith.length ? role.sharedWith.map(id => `<@${id}>`).join(', ') : 'Nobody added yet.';
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Role Sharing').setDescription(names)] });
}

async function templateList(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'roleTemplates')) return message.channel.send({ embeds: [featureDisabledEmbed('role templates')] });
  const templates = await getTemplates(message.guild.id);
  if (!templates.length) return message.channel.send({ embeds: [errorEmbed('No templates available.')] });
  const embed = new EmbedBuilder().setColor(0xF47FFF).setTitle('🎭 Available Templates')
    .setDescription(templates.map(t => `${t.emoji} **${t.name}** — \`${t.color}\`\n${t.description}`).join('\n\n'))
    .setFooter({ text: 'Apply with: .booster template apply <name>' });
  return message.channel.send({ embeds: [embed] });
}

async function templateApply(message, args) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'roleTemplates')) return message.channel.send({ embeds: [featureDisabledEmbed('role templates')] });
  const name = args.join(' ');
  if (!name) return message.channel.send({ embeds: [errorEmbed('Usage: `.booster template apply <name>`')] });
  const tmpl = await getTemplate(message.guild.id, name);
  if (!tmpl) return message.channel.send({ embeds: [errorEmbed(`Template "${name}" not found. See \`.booster template list\`.`)] });
  const role = await BoosterRole.findOne({ guildId: message.guild.id, userId: message.author.id, active: true });
  if (!role) return message.channel.send({ embeds: [errorEmbed("You don't have an active custom role.")] });
  try {
    await editBoosterRole(message.guild, message.author.id, { color: tmpl.color });
    role.template = tmpl.name; await role.save();
    return message.channel.send({ embeds: [successEmbed(`Applied **${tmpl.name}** (${tmpl.color}) to your role.`)] });
  } catch (err) { return message.channel.send({ embeds: [errorEmbed(err.message)] }); }
}

async function backup(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'roleBackup')) return message.channel.send({ embeds: [featureDisabledEmbed('role backup')] });
  try {
    await createBackup(message.guild.id, message.author.id);
    return message.channel.send({ embeds: [successEmbed('Backup saved successfully.')] });
  } catch (err) { return message.channel.send({ embeds: [errorEmbed(err.message)] }); }
}

async function restore(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'softDeleteRestore')) return message.channel.send({ embeds: [featureDisabledEmbed('restore')] });
  const { restoreRole } = await import('../services/roleService.js');
  const { restoreVC }   = await import('../services/vcService.js');
  const r  = await restoreRole(message.guild, message.author.id);
  const vc = await restoreVC(message.guild, message.author.id);
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('♻️ Restore Results')
    .setDescription([r ? '✅ Role restored' : '— No inactive role', vc ? '✅ VC restored' : '— No inactive VC'].join('\n'))] });
}

async function exportData(message) {
  const settings = await getSettings(message.guild.id);
  if (!isEnabled(settings, 'roleBackup')) return message.channel.send({ embeds: [featureDisabledEmbed('backup/export')] });
  const json = await exportBackupJSON(message.guild.id, message.author.id);
  if (!json) return message.channel.send({ embeds: [errorEmbed('No backup found. Run `.booster backup` first.')] });
  return message.channel.send({ files: [{ attachment: Buffer.from(json, 'utf-8'), name: `backup-${message.author.id}.json` }], embeds: [successEmbed('Here is your backup file.')] });
}

export async function execute(message, args, client) {
  const sub  = args[0]?.toLowerCase() ?? '';
  const rest = args.slice(1);
  try {
    switch (sub) {
      case '': case 'dashboard': return await dashboard(message, client);
      case 'request-vc':   return await requestVCPanel(message);
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
      case 'role':
        if (rest[0]?.toLowerCase() === 'delete') {
          const r = await softDeleteRole(message.guild, message.author.id);
          return message.channel.send({ embeds: [r ? successEmbed('Role removed (data kept for restore).') : errorEmbed('No active role found.')] });
        }
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster role delete`')] });
      case 'vc':
        if (rest[0]?.toLowerCase() === 'delete') {
          const v = await softDeleteVC(message.guild, message.author.id);
          return message.channel.send({ embeds: [v ? successEmbed('VC removed (data kept for restore).') : errorEmbed('No active VC found.')] });
        }
        return message.channel.send({ embeds: [errorEmbed('Usage: `.booster vc delete`')] });
      default:
        return message.channel.send({ embeds: [errorEmbed(`Unknown subcommand \`${sub}\`. Try \`.help booster\`.`)] });
    }
  } catch (err) {
    console.error('[Booster] Command error:', err);
    return message.channel.send({ embeds: [errorEmbed('Something went wrong.')] });
  }
}

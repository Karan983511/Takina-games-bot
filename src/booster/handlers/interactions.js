import {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';
import { createBoosterRole, restoreRole } from '../services/roleService.js';
import { createBoosterVC, restoreVC }     from '../services/vcService.js';
import { createBackup, exportBackupJSON } from '../services/backupService.js';
import { getTemplates, getSettings, isEnabled } from '../services/settingsService.js';
import { castVote } from '../services/voteService.js';
import { normalizeHex, isBooster, isAdmin, clampUserLimit } from '../utils/validators.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { getPage } from '../commands/help.js';

export async function handleBoosterInteraction(interaction, client) {
  const id = interaction.customId;

  if (id.startsWith('booster_help_')) {
    const { embed, row } = getPage(id.replace('booster_help_', ''));
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (id.startsWith('bsettings_toggle_')) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!isAdmin(member)) return interaction.reply({ embeds: [errorEmbed('Admin only.')], flags: MessageFlags.Ephemeral });
    const key = id.replace('bsettings_toggle_', '');
    const settings = await getSettings(interaction.guild.id);
    settings.features[key] = !settings.features[key]; await settings.save();
    return interaction.reply({ embeds: [successEmbed(`**${key}** is now ${settings.features[key] ? '✅ enabled' : '❌ disabled'}.`)], flags: MessageFlags.Ephemeral });
  }

  if (id === 'booster_backup') {
    await createBackup(interaction.guild.id, interaction.user.id);
    return interaction.reply({ embeds: [successEmbed('Backup saved.')], flags: MessageFlags.Ephemeral });
  }

  if (id === 'booster_export') {
    const json = await exportBackupJSON(interaction.guild.id, interaction.user.id);
    if (!json) return interaction.reply({ embeds: [errorEmbed('No backup found. Run `.booster backup` first.')], flags: MessageFlags.Ephemeral });
    return interaction.reply({ files: [{ attachment: Buffer.from(json), name: `backup-${interaction.user.id}.json` }], flags: MessageFlags.Ephemeral });
  }

  if (id === 'booster_restore') {
    const r  = await restoreRole(interaction.guild, interaction.user.id);
    const vc = await restoreVC(interaction.guild, interaction.user.id);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('♻️ Restore').setDescription([r ? '✅ Role restored' : '— No inactive role', vc ? '✅ VC restored' : '— No inactive VC'].join('\n'))], flags: MessageFlags.Ephemeral });
  }

  if (id === 'booster_share_list') {
    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, active: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Sharing').setDescription(role?.sharedWith.length ? role.sharedWith.map(i => `<@${i}>`).join(', ') : 'Nobody added yet.')], flags: MessageFlags.Ephemeral });
  }

  if (id === 'booster_templates') {
    const tmpl = await getTemplates(interaction.guild.id);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF47FFF).setTitle('🎭 Templates').setDescription(tmpl.map(t => `${t.emoji} **${t.name}** — \`${t.color}\``).join('\n') || 'None.').setFooter({ text: 'Apply: .booster template apply <name>' })], flags: MessageFlags.Ephemeral });
  }

  if (id.startsWith('booster_vote_') && id !== 'booster_vote_btn') {
    const roleId = id.replace('booster_vote_', '');
    try {
      await castVote(interaction.guild.id, interaction.user.id, roleId);
      const r = interaction.guild.roles.cache.get(roleId);
      return interaction.reply({ embeds: [successEmbed(`Voted for **${r?.name ?? roleId}**! You can change it any time.`)], flags: MessageFlags.Ephemeral });
    } catch (err) { return interaction.reply({ embeds: [errorEmbed(err.message)], flags: MessageFlags.Ephemeral }); }
  }

  if (id === 'booster_req_role') {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!isBooster(member) && !isAdmin(member)) return interaction.reply({ embeds: [errorEmbed('Server boosters only.')], flags: MessageFlags.Ephemeral });
    const existing = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, active: true });
    if (existing) return interaction.reply({ embeds: [errorEmbed(`You already have a role: <@&${existing.roleId}>. Use \`.booster edit\` to change it.`)], flags: MessageFlags.Ephemeral });
    return interaction.showModal(new ModalBuilder().setCustomId('booster_role_modal').setTitle('🎨 Custom Role Request').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Role Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('e.g. Moonlight')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Role Color (hex code)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#FF6B35')),
    ));
  }

  if (id === 'booster_role_modal') {
    const settings = await getSettings(interaction.guild.id);
    if (!isEnabled(settings,'customRoles')) return interaction.reply({ embeds: [errorEmbed('Custom roles are disabled.')], flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name  = interaction.fields.getTextInputValue('role_name').trim();
    const color = normalizeHex(interaction.fields.getTextInputValue('role_color').trim());
    if (!color) return interaction.editReply({ embeds: [errorEmbed('Invalid hex color. Use format `#FF6B35`.')] });
    try {
      const { discordRole } = await createBoosterRole(interaction.guild, interaction.user.id, { name, color });
      await audit(client, interaction.guild.id, interaction.user.id, 'ROLE_CREATED', { name, color, roleId: discordRole.id });
      return interaction.editReply({ embeds: [successEmbed(`Your custom role ${discordRole} has been created!`)] });
    } catch (err) { return interaction.editReply({ embeds: [errorEmbed(`Failed: ${err.message}`)] }); }
  }

  if (id === 'booster_req_vc') {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!isBooster(member) && !isAdmin(member)) return interaction.reply({ embeds: [errorEmbed('Server boosters only.')], flags: MessageFlags.Ephemeral });
    return interaction.showModal(new ModalBuilder().setCustomId('booster_vc_modal').setTitle('🔊 Custom Voice Channel').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vc_name').setLabel('Channel Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('e.g. Chill Lounge')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vc_limit').setLabel('User Limit (0 = unlimited)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setPlaceholder('0')),
    ));
  }

  if (id === 'booster_vc_modal') {
    const settings = await getSettings(interaction.guild.id);
    if (!isEnabled(settings,'customVC')) return interaction.reply({ embeds: [errorEmbed('Custom VCs are disabled.')], flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name      = interaction.fields.getTextInputValue('vc_name').trim();
    const userLimit = clampUserLimit(interaction.fields.getTextInputValue('vc_limit') || '0');
    try {
      const { channel } = await createBoosterVC(interaction.guild, interaction.user.id, { name, userLimit });
      await audit(client, interaction.guild.id, interaction.user.id, 'VC_CREATED', { name, channelId: channel.id });
      return interaction.editReply({ embeds: [successEmbed(`Your VC ${channel} has been created!`)] });
    } catch (err) { return interaction.editReply({ embeds: [errorEmbed(`Failed: ${err.message}`)] }); }
  }
}

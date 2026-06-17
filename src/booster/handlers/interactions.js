import {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';
import BoosterSettings from '../models/BoosterSettings.js';
import { buildRoleListPayload } from '../utils/roleListBuilder.js';
import BoosterRole from '../models/BoosterRole.js';
import { createBoosterRole, restoreRole } from '../services/roleService.js';
import { createBoosterVC, restoreVC }     from '../services/vcService.js';
import { createBackup, exportBackupJSON } from '../services/backupService.js';
import { getTemplates, getSettings, isEnabled } from '../services/settingsService.js';
import { castVote } from '../services/voteService.js';
import { normalizeHex, isBooster, isAdmin, clampUserLimit } from '../utils/validators.js';
import { syncRoleColors } from '../services/discordRoleColorApi.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { getPage } from '../commands/help.js';

export async function handleBoosterInteraction(interaction, client) {
  const id = interaction.customId;

  // ── .role reset confirm/cancel ──────────────────────────────────────────────
  if (id.startsWith('rolereset_confirm_') || id.startsWith('rolereset_cancel_')) {
    const ownerId = id.split('_').pop();
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ embeds: [errorEmbed('This confirmation is not for you.')], flags: MessageFlags.Ephemeral });
    }
    if (id.startsWith('rolereset_cancel_')) {
      await interaction.message.delete().catch(() => {});
      return interaction.reply({ embeds: [successEmbed('Reset cancelled.')], flags: MessageFlags.Ephemeral });
    }
    // Confirm reset
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const guild = interaction.guild;
      const doc   = await BoosterRole.findOne({ guildId: guild.id, userId: ownerId, active: true });
      if (!doc) {
        await interaction.message.delete().catch(() => {});
        return interaction.editReply({ embeds: [errorEmbed('No active role found.')] });
      }
      const discordRole = guild.roles.cache.get(doc.roleId);
      if (discordRole) {
        await discordRole.edit({ name: 'Booster Role', color: 0x99AAB5, icon: null, unicodeEmoji: null }).catch(() => {});
        await syncRoleColors(guild, discordRole.id, { primary: '#99AAB5', secondary: null }).catch(() => {});
      }
      doc.name           = 'Booster Role';
      doc.color          = '#99AAB5';
      doc.colorSecondary = null;
      doc.iconType       = 'none';
      doc.icon           = null;
      await doc.save();
      await audit(client, guild.id, ownerId, 'ROLE_RESET', { roleId: doc.roleId });
      await interaction.message.delete().catch(() => {});
      return interaction.editReply({ embeds: [successEmbed(`Your role has been reset to defaults. Use \`.role setup\` to customize it again.`)] });
    } catch (err) {
      console.error('[interactions] rolereset error:', err);
      return interaction.editReply({ embeds: [errorEmbed(`Reset failed: ${err.message}`)] });
    }
  }

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
    if (!role) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Sharing').setDescription('Nobody added yet.')], flags: MessageFlags.Ephemeral });
    // Prune members who left or no longer have the role
    const discordRole = role.roleId ? interaction.guild.roles.cache.get(role.roleId) : null;
    const valid = [];
    for (const uid of role.sharedWith) {
      const m = interaction.guild.members.cache.get(uid) ?? await interaction.guild.members.fetch(uid).catch(() => null);
      if (m && (!discordRole || m.roles.cache.has(role.roleId))) valid.push(uid);
    }
    if (valid.length !== role.sharedWith.length) { role.sharedWith = valid; await role.save(); }
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Sharing').setDescription(valid.length ? valid.map(i => `<@${i}>`).join(', ') : 'Nobody added yet.')], flags: MessageFlags.Ephemeral });
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
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Primary Color (hex code)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#FF6B35')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color_2').setLabel('Secondary Color (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setPlaceholder('#6B35FF')),
    ));
  }

  if (id === 'booster_role_modal') {
    const settings = await getSettings(interaction.guild.id);
    if (!isEnabled(settings,'customRoles')) return interaction.reply({ embeds: [errorEmbed('Custom roles are disabled.')], flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name  = interaction.fields.getTextInputValue('role_name').trim();
    const color = normalizeHex(interaction.fields.getTextInputValue('role_color').trim());
    const color2Raw = interaction.fields.getTextInputValue('role_color_2')?.trim();
    const colorSecondary = color2Raw ? normalizeHex(color2Raw) : null;
    if (!color) return interaction.editReply({ embeds: [errorEmbed('Invalid hex color. Use format `#FF6B35`.')] });
    if (color2Raw && !colorSecondary) return interaction.editReply({ embeds: [errorEmbed('Secondary color is invalid. Use a hex code like `#6B35FF`.')] });
    try {
      const { discordRole } = await createBoosterRole(interaction.guild, interaction.user.id, { name, color, colorSecondary });
      await audit(client, interaction.guild.id, interaction.user.id, 'ROLE_CREATED', { name, color: colorSecondary ? `${color} → ${colorSecondary}` : color, roleId: discordRole.id });
      const note = colorSecondary ? (interaction.guild.features?.includes('ENHANCED_ROLE_COLORS') ? '' : '\n\n> ⚠️ Your server does not support Enhanced Role Colors yet, so only the primary color was applied.') : '';
      return interaction.editReply({ embeds: [successEmbed(`Your custom role ${discordRole} has been created!${note}`)] });
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

  // ── .role list pagination ─────────────────────────────────────────────────
  if (id.startsWith('rolelist_p_')) {
    const page     = parseInt(id.replace('rolelist_p_', ''), 10);
    const settings = await BoosterSettings.findOne({ guildId: interaction.guild.id }).lean();
    const payload  = await buildRoleListPayload(interaction.guild, settings, page);
    return interaction.update(payload);
  }
}

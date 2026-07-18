/**
 * .role manage — Members manage custom roles that have been shared with them.
 *
 * Three states for a sharedWith member:
 *   Active  — in sharedWith, NOT in hiddenBy  → has Discord role  → can Hide or Remove
 *   Hidden  — in sharedWith, AND in hiddenBy  → no Discord role   → can Unhide or Remove
 *   Removed — not in sharedWith at all        → permanently gone, not shown here
 *
 * Custom-ID prefix: rolemanage_
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberIsHidden(role, userId) {
  return Array.isArray(role.hiddenBy) && role.hiddenBy.includes(userId);
}

function statusLabel(role, userId) {
  return memberIsHidden(role, userId) ? '👻 Hidden' : '✅ Active';
}

function buildDetailEmbed(role, userId) {
  const hidden = memberIsHidden(role, userId);
  const color  = hidden ? 0x5865F2 : (parseInt((role.color ?? '#99AAB5').replace('#', ''), 16) || 0xF47FFF);
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎨 ${role.name}`)
    .addFields(
      { name: 'Owner',  value: `<@${role.userId}>`, inline: true },
      { name: 'Status', value: statusLabel(role, userId), inline: true },
    )
    .setDescription(
      hidden
        ? "This role is **hidden** — you don't currently have it in Discord, but you can restore it any time with **Unhide**."
        : 'This role is **active** — you currently have it in Discord.',
    )
    .setFooter({ text: 'Use the buttons below to manage this role.' });
}

function actionRow(userId, ownerId, hidden) {
  const row = new ActionRowBuilder();
  if (hidden) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rolemanage_unhide_${userId}_${ownerId}`)
        .setLabel('Unhide')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rolemanage_hide_${userId}_${ownerId}`)
        .setLabel('Hide')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👻'),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`rolemanage_rm_${userId}_${ownerId}`)
      .setLabel('Remove')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  );
  return row;
}

// ─── .role manage entry point ─────────────────────────────────────────────────

export async function execute(message) {
  const { guild, author } = message;

  const roles = await BoosterRole.find({
    guildId:    guild.id,
    active:     true,
    sharedWith: author.id,
  }).lean();

  if (!roles.length) {
    return message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(
          "❌ You don't have any custom roles assigned to you.\n\n" +
          'A booster can share their role with you using `.role give @you`.',
        )],
    });
  }

  // Single role — skip the select menu, go straight to action buttons
  if (roles.length === 1) {
    const role   = roles[0];
    const hidden = memberIsHidden(role, author.id);
    return message.channel.send({
      embeds:     [buildDetailEmbed(role, author.id)],
      components: [actionRow(author.id, role.userId, hidden)],
    });
  }

  // Multiple roles — show a select menu first
  const options = roles.map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(r.name.slice(0, 100))
      .setValue(r.userId)
      .setEmoji(memberIsHidden(r, author.id) ? '👻' : '✅')
      .setDescription(`${statusLabel(r, author.id)} • Owner ID: ${r.userId}`),
  );

  const fields = roles.map(r => ({
    name:   r.name,
    value:  `Owner: <@${r.userId}> • Status: **${statusLabel(r, author.id)}**`,
    inline: false,
  }));

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🎨 Manage Your Custom Roles')
    .setDescription('Select a role from the menu below to manage it.')
    .addFields(fields)
    .setFooter({ text: 'You can hide, unhide, or permanently remove yourself from a role.' });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rolemanage_sel_${author.id}`)
      .setPlaceholder('Select a role to manage…')
      .addOptions(options),
  );

  return message.channel.send({ embeds: [embed], components: [row] });
}

// ─── Interaction handler ──────────────────────────────────────────────────────

export async function handleManageInteraction(interaction, client) {
  const id = interaction.customId;

  // ── Select menu: pick a role ────────────────────────────────────────────────
  if (id.startsWith('rolemanage_sel_')) {
    const userId  = id.slice('rolemanage_sel_'.length);
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }
    const ownerId = interaction.values[0];
    const role    = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return interaction.update({
        embeds:     [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ That role no longer exists or you are no longer assigned to it.')],
        components: [],
      });
    }
    const hidden = memberIsHidden(role, userId);
    return interaction.update({
      embeds:     [buildDetailEmbed(role, userId)],
      components: [actionRow(userId, ownerId, hidden)],
    });
  }

  // ── Hide ────────────────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_hide_')) {
    const rest    = id.slice('rolemanage_hide_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }
    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ Role not found or you are no longer assigned to it.')],
        components: [],
      });
    }
    if (memberIsHidden(role, userId)) {
      return interaction.update({
        embeds:     [buildDetailEmbed(role, userId)],
        components: [actionRow(userId, ownerId, true)],
      });
    }

    // Remove Discord role
    const member = interaction.guild.members.cache.get(userId)
                ?? await interaction.guild.members.fetch(userId).catch(() => null);
    if (role.roleId && member) {
      await member.roles.remove(role.roleId).catch(() => {});
    }

    // Mark hidden in DB
    if (!role.hiddenBy.includes(userId)) role.hiddenBy.push(userId);
    await role.save();
    await audit(client, interaction.guild.id, userId, 'ROLE_HIDDEN', { ownerId, roleId: role.roleId });

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👻 Role Hidden')
        .setDescription(
          `**${role.name}** has been hidden — you no longer have it in Discord.\n\n` +
          'You can restore it any time with `.role manage` → **Unhide**.',
        )],
      components: [],
    });
  }

  // ── Unhide ──────────────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_unhide_')) {
    const rest    = id.slice('rolemanage_unhide_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }

    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });

    if (!role) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ The custom role configuration no longer exists. The owner may have deleted it.')],
        components: [],
      });
    }
    if (!role.sharedWith.includes(userId)) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ The role owner has removed you from this role. You can no longer restore it.')],
        components: [],
      });
    }
    if (!role.roleId) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ The Discord role is missing. The owner may need to restore their role first.')],
        components: [],
      });
    }

    const discordRole = interaction.guild.roles.cache.get(role.roleId)
                     ?? await interaction.guild.roles.fetch(role.roleId).catch(() => null);
    if (!discordRole) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ The Discord role no longer exists in this server.')],
        components: [],
      });
    }

    const member = interaction.guild.members.cache.get(userId)
                ?? await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Could not find you in this server.')],
        components: [],
      });
    }

    const added = await member.roles.add(discordRole).then(() => true).catch(() => false);
    if (!added) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Failed to add the role — the bot may not have permission to manage it.')],
        components: [],
      });
    }

    role.hiddenBy = role.hiddenBy.filter(hid => hid !== userId);
    await role.save();
    await audit(client, interaction.guild.id, userId, 'ROLE_UNHIDDEN', { ownerId, roleId: role.roleId });

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Role Restored')
        .setDescription(`**${role.name}** (${discordRole}) has been restored. You now have it in Discord again.`)],
      components: [],
    });
  }

  // ── Remove (show confirmation) ──────────────────────────────────────────────
  if (id.startsWith('rolemanage_rm_')) {
    const rest    = id.slice('rolemanage_rm_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }

    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ Role not found or you are no longer assigned to it.')],
        components: [],
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rolemanage_ok_${userId}_${ownerId}`)
        .setLabel('Yes, Remove Me')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId(`rolemanage_no_${userId}_${ownerId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✖️'),
    );

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Confirm Removal')
        .setDescription(
          `Are you sure you want to **permanently remove yourself** from **${role.name}**?\n\n` +
          '⚠️ You will lose this role and **cannot restore it yourself** — the owner would need to re-assign you.',
        )],
      components: [confirmRow],
    });
  }

  // ── Confirm removal ─────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_ok_')) {
    const rest    = id.slice('rolemanage_ok_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }

    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });
    if (role && role.sharedWith.includes(userId)) {
      const member = interaction.guild.members.cache.get(userId)
                  ?? await interaction.guild.members.fetch(userId).catch(() => null);
      if (role.roleId && member) await member.roles.remove(role.roleId).catch(() => {});
      role.sharedWith = role.sharedWith.filter(s => s !== userId);
      role.hiddenBy   = role.hiddenBy.filter(h => h !== userId);
      await role.save();
      await audit(client, interaction.guild.id, userId, 'ROLE_SELF_REMOVED', { ownerId, roleId: role.roleId });
    }

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🗑️ Removed')
        .setDescription('You have been permanently removed from this role. The owner would need to re-assign you if you want it back.')],
      components: [],
    });
  }

  // ── Cancel removal ──────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_no_')) {
    const rest    = id.slice('rolemanage_no_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral });
    }
    const role = await BoosterRole.findOne({ guildId: interaction.guild.id, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ Role not found or you are no longer assigned to it.')],
        components: [],
      });
    }
    const hidden = memberIsHidden(role, userId);
    return interaction.update({
      embeds:     [buildDetailEmbed(role, userId)],
      components: [actionRow(userId, ownerId, hidden)],
    });
  }
}

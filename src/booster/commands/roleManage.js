/**
 * .role manage — Members manage custom roles that have been shared with them.
 *
 * Three states for a sharedWith member:
 *   Active  — in sharedWith, NOT in hiddenBy  → has Discord role  → can Hide or Remove
 *   Hidden  — in sharedWith, AND in hiddenBy  → no Discord role   → can Unhide or Remove
 *   Removed — not in sharedWith at all        → permanently gone, not shown here
 *
 * The panel stays interactive after every action — hiding/unhiding re-renders
 * the same role's panel with the new state, instead of ending the flow. Only
 * a confirmed Remove ends a role's panel (there's nothing left to manage), and
 * that falls back to the list (or a "you're all done" message if none remain).
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
import { errorEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';

const BRAND       = 0xF47FFF;
const ACTIVE_CLR  = 0x57F287;
const HIDDEN_CLR  = 0x5865F2;
const DANGER_CLR  = 0xED4245;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberIsHidden(role, userId) {
  return Array.isArray(role.hiddenBy) && role.hiddenBy.includes(userId);
}

function statusLabel(role, userId) {
  return memberIsHidden(role, userId) ? '👻 Hidden' : '✅ Active';
}

async function getManageableRoles(guildId, userId) {
  return BoosterRole.find({ guildId, active: true, sharedWith: userId }).lean();
}

// Not your panel — every button/select checks this before doing anything.
function notYours(interaction, userId) {
  return interaction.user.id !== userId
    ? interaction.reply({ embeds: [errorEmbed("This isn't your panel.")], flags: MessageFlags.Ephemeral })
    : null;
}

// Shows an error, but keeps the panel alive with a "Back to list" button if the
// member still has other roles to manage — only a true dead end (zero roles
// left) gets no components.
async function errorKeepGoing(interaction, guildId, userId, text) {
  const total = await BoosterRole.countDocuments({ guildId, active: true, sharedWith: userId });
  const components = total > 0
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rolemanage_back_${userId}`).setLabel('Back to list').setStyle(ButtonStyle.Secondary).setEmoji('◀️'),
      )]
    : [];
  return interaction.update({ embeds: [errorEmbed(text)], components });
}

// ─── List view (shown when a member has more than one shared role) ────────────

function buildListPayload(roles, userId) {
  const options = roles.map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(r.name.slice(0, 100))
      .setValue(r.userId)
      .setEmoji(memberIsHidden(r, userId) ? '👻' : '✅')
      .setDescription(`${statusLabel(r, userId)} • Owner ID: ${r.userId}`.slice(0, 100)),
  );

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('🎨 Manage Your Custom Roles')
    .setDescription(
      roles.map(r => `**${r.name}** — <@${r.userId}> — ${statusLabel(r, userId)}`).join('\n'),
    )
    .setFooter({ text: 'Select a role below to hide, unhide, or permanently remove yourself from it.' });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rolemanage_sel_${userId}`)
      .setPlaceholder('Select a role to manage…')
      .addOptions(options),
  );

  return { embeds: [embed], components: [row] };
}

async function sendOrShowList(target, guild, userId, { isInteraction }) {
  const roles = await getManageableRoles(guild.id, userId);

  if (!roles.length) {
    const payload = {
      embeds: [errorEmbed(
        "You don't have any custom roles assigned to you.\n\n" +
        'A booster can share their role with you using `.role give @you`.',
      )],
      components: [],
    };
    return isInteraction ? target.update(payload) : target.channel.send(payload);
  }

  if (roles.length === 1) {
    const payload = buildDetailPayload(roles[0], userId, false);
    return isInteraction ? target.update(payload) : target.channel.send(payload);
  }

  const payload = buildListPayload(roles, userId);
  return isInteraction ? target.update(payload) : target.channel.send(payload);
}

// ─── Detail view (single role — hide / unhide / remove) ───────────────────────

function buildDetailPayload(role, userId, showBack) {
  const hidden = memberIsHidden(role, userId);
  const color  = hidden ? HIDDEN_CLR : (parseInt((role.color ?? '#99AAB5').replace('#', ''), 16) || ACTIVE_CLR);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎨 ${role.name}`)
    .addFields(
      { name: 'Owner',  value: `<@${role.userId}>`, inline: true },
      { name: 'Status', value: statusLabel(role, userId), inline: true },
    )
    .setDescription(
      hidden
        ? "👻 **Hidden** — you don't currently have this role in Discord. Use **Unhide** to restore it any time."
        : '✅ **Active** — you currently have this role in Discord.',
    )
    .setFooter({ text: 'Use the buttons below to manage this role.' });

  const row = new ActionRowBuilder().addComponents(
    hidden
      ? new ButtonBuilder().setCustomId(`rolemanage_unhide_${userId}_${role.userId}`).setLabel('Unhide').setStyle(ButtonStyle.Success).setEmoji('✅')
      : new ButtonBuilder().setCustomId(`rolemanage_hide_${userId}_${role.userId}`).setLabel('Hide').setStyle(ButtonStyle.Secondary).setEmoji('👻'),
    new ButtonBuilder().setCustomId(`rolemanage_rm_${userId}_${role.userId}`).setLabel('Remove').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  );

  if (showBack) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`rolemanage_back_${userId}`).setLabel('Back to list').setStyle(ButtonStyle.Secondary).setEmoji('◀️'),
    );
  }

  return { embeds: [embed], components: [row] };
}

// Re-fetches the role + the member's full role count, then renders the detail
// panel with a "Back to list" button only when there's actually a list to go back to.
async function showDetail(interaction, guildId, userId, ownerId) {
  const role = await BoosterRole.findOne({ guildId, userId: ownerId, active: true });
  if (!role || !role.sharedWith.includes(userId)) {
    return errorKeepGoing(interaction, guildId, userId, "You're no longer assigned to that role (it may have already been removed).");
  }
  const total = await BoosterRole.countDocuments({ guildId, active: true, sharedWith: userId });
  return interaction.update(buildDetailPayload(role, userId, total > 1));
}

// ─── .role manage entry point ─────────────────────────────────────────────────

export async function execute(message) {
  return sendOrShowList(message, message.guild, message.author.id, { isInteraction: false });
}

// ─── Interaction handler ──────────────────────────────────────────────────────

export async function handleManageInteraction(interaction, client) {
  const id = interaction.customId;
  const guildId = interaction.guild.id;

  // ── Select menu: pick a role ────────────────────────────────────────────────
  if (id.startsWith('rolemanage_sel_')) {
    const userId = id.slice('rolemanage_sel_'.length);
    if (interaction.user.id !== userId) return notYours(interaction, userId);
    const ownerId = interaction.values[0];
    return showDetail(interaction, guildId, userId, ownerId);
  }

  // ── Back to list ─────────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_back_')) {
    const userId = id.slice('rolemanage_back_'.length);
    if (interaction.user.id !== userId) return notYours(interaction, userId);
    return sendOrShowList(interaction, interaction.guild, userId, { isInteraction: true });
  }

  // ── Hide ────────────────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_hide_')) {
    const rest    = id.slice('rolemanage_hide_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) return notYours(interaction, userId);

    const role = await BoosterRole.findOne({ guildId, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return errorKeepGoing(interaction, guildId, userId, "You're no longer assigned to that role (it may have already been removed).");
    }
    if (memberIsHidden(role, userId)) {
      // Already hidden (e.g. double click) — just re-render, no-op.
      const total = await BoosterRole.countDocuments({ guildId, active: true, sharedWith: userId });
      return interaction.update(buildDetailPayload(role, userId, total > 1));
    }

    const member = interaction.guild.members.cache.get(userId)
                ?? await interaction.guild.members.fetch(userId).catch(() => null);
    if (role.roleId && member) await member.roles.remove(role.roleId).catch(() => {});

    if (!role.hiddenBy.includes(userId)) role.hiddenBy.push(userId);
    await role.save();
    await audit(client, guildId, userId, 'ROLE_HIDDEN', { ownerId, roleId: role.roleId });

    const total = await BoosterRole.countDocuments({ guildId, active: true, sharedWith: userId });
    return interaction.update(buildDetailPayload(role, userId, total > 1));
  }

  // ── Unhide ──────────────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_unhide_')) {
    const rest    = id.slice('rolemanage_unhide_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) return notYours(interaction, userId);

    const role = await BoosterRole.findOne({ guildId, userId: ownerId, active: true });
    if (!role) {
      return errorKeepGoing(interaction, guildId, userId, 'The custom role configuration no longer exists. The owner may have deleted it.');
    }
    if (!role.sharedWith.includes(userId)) {
      return errorKeepGoing(interaction, guildId, userId, 'The role owner has removed you from this role. You can no longer restore it.');
    }
    if (!role.roleId) {
      return errorKeepGoing(interaction, guildId, userId, 'The Discord role is missing. The owner may need to restore their role first.');
    }

    const discordRole = interaction.guild.roles.cache.get(role.roleId)
                     ?? await interaction.guild.roles.fetch(role.roleId).catch(() => null);
    if (!discordRole) {
      return errorKeepGoing(interaction, guildId, userId, 'The Discord role no longer exists in this server.');
    }

    const member = interaction.guild.members.cache.get(userId)
                ?? await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return errorKeepGoing(interaction, guildId, userId, 'Could not find you in this server.');
    }

    const added = await member.roles.add(discordRole).then(() => true).catch(() => false);
    if (!added) {
      return errorKeepGoing(interaction, guildId, userId, 'Failed to add the role — the bot may not have permission to manage it.');
    }

    role.hiddenBy = role.hiddenBy.filter(hid => hid !== userId);
    await role.save();
    await audit(client, guildId, userId, 'ROLE_UNHIDDEN', { ownerId, roleId: role.roleId });

    const total = await BoosterRole.countDocuments({ guildId, active: true, sharedWith: userId });
    return interaction.update(buildDetailPayload(role, userId, total > 1));
  }

  // ── Remove (show confirmation) ──────────────────────────────────────────────
  if (id.startsWith('rolemanage_rm_')) {
    const rest    = id.slice('rolemanage_rm_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) return notYours(interaction, userId);

    const role = await BoosterRole.findOne({ guildId, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return errorKeepGoing(interaction, guildId, userId, 'Role not found or you are no longer assigned to it.');
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rolemanage_ok_${userId}_${ownerId}`).setLabel('Yes, Remove Me').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`rolemanage_no_${userId}_${ownerId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
    );

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(DANGER_CLR)
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
    if (interaction.user.id !== userId) return notYours(interaction, userId);

    const role = await BoosterRole.findOne({ guildId, userId: ownerId, active: true });
    if (!role || !role.sharedWith.includes(userId)) {
      return errorKeepGoing(interaction, guildId, userId, "You're no longer assigned to that role (it may have already been removed).");
    }

    const member = interaction.guild.members.cache.get(userId)
                ?? await interaction.guild.members.fetch(userId).catch(() => null);
    if (role.roleId && member) await member.roles.remove(role.roleId).catch(() => {});
    role.sharedWith = role.sharedWith.filter(s => s !== userId);
    role.hiddenBy   = role.hiddenBy.filter(h => h !== userId);
    await role.save();
    await audit(client, guildId, userId, 'ROLE_SELF_REMOVED', { ownerId, roleId: role.roleId });

    // Nothing left to manage for this role — fall back to the list (or the
    // "you're all done" message if that was the last one), so the panel
    // keeps going instead of dead-ending.
    return sendOrShowList(interaction, interaction.guild, userId, { isInteraction: true });
  }

  // ── Cancel removal ──────────────────────────────────────────────────────────
  if (id.startsWith('rolemanage_no_')) {
    const rest    = id.slice('rolemanage_no_'.length).split('_');
    const userId  = rest[0];
    const ownerId = rest.slice(1).join('_');
    if (interaction.user.id !== userId) return notYours(interaction, userId);
    return showDetail(interaction, guildId, userId, ownerId);
  }
}

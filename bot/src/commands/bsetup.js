/**
 * /bsetup — Booster module admin configuration panel
 * Requires Manage Guild permission.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';

import BoosterSettings from '../booster/models/BoosterSettings.js';
import BoosterRole     from '../booster/models/BoosterRole.js';
import { getSettings } from '../booster/services/settingsService.js';

// ─── Slash command definition ─────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('bsetup')
  .setDescription('Configure the Takina Booster module (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: '⛔ You need **Manage Server** permission.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = await getSettings(interaction.guild.id);
  const { embed, rows } = await buildPanel('overview', interaction.guild, settings);

  return interaction.editReply({ embeds: [embed], components: rows });
}

// ─── Component interaction handler ────────────────────────────────────────────

export async function handleComponent(interaction, client) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: '⛔ You need **Manage Server** permission.', flags: MessageFlags.Ephemeral });
  }

  const id       = interaction.customId;
  const guild    = interaction.guild;
  const settings = await getSettings(guild.id);

  // ── Navigation select menu ─────────────────────────────────────────────────
  if (id === 'bsetup_nav') {
    const section = interaction.values[0];
    const { embed, rows } = await buildPanel(section, guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Feature toggles ────────────────────────────────────────────────────────
  if (id.startsWith('bsetup_toggle_')) {
    const feature = id.replace('bsetup_toggle_', '');
    const validFeatures = ['customRoles','roleSharing','customVC','softDeleteRestore','roleTemplates','roleBackup','weeklyRotation','featuredVoting','hallOfFame','dashboard'];
    if (!validFeatures.includes(feature)) {
      return interaction.reply({ content: '❌ Unknown feature.', flags: MessageFlags.Ephemeral });
    }
    settings.features[feature] = !settings.features[feature];
    await settings.save();
    const { embed, rows } = await buildPanel('features', guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Required role: set ─────────────────────────────────────────────────────
  if (id === 'bsetup_required_role_set') {
    const modal = new ModalBuilder()
      .setCustomId('bsetup_modal_required_role')
      .setTitle('Set Required Role')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Role ID (right-click role → Copy ID)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 123456789012345678')
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  // ── Required role: modal submit ────────────────────────────────────────────
  if (id === 'bsetup_modal_required_role') {
    const roleId = interaction.fields.getTextInputValue('role_id').trim();
    const role   = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({
        content: `❌ Role \`${roleId}\` not found. Make sure you copied the Role ID correctly (Enable Developer Mode → right-click role → Copy ID).`,
        flags: MessageFlags.Ephemeral,
      });
    }
    settings.requiredRoleId = roleId;
    await settings.save();
    await interaction.deferUpdate();
    const { embed, rows } = await buildPanel('required_role', guild, settings);
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Required role: clear ───────────────────────────────────────────────────
  if (id === 'bsetup_required_role_clear') {
    settings.requiredRoleId = null;
    await settings.save();
    const { embed, rows } = await buildPanel('required_role', guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Boundaries: set via modal ──────────────────────────────────────────────
  if (id === 'bsetup_boundaries_set') {
    const modal = new ModalBuilder()
      .setCustomId('bsetup_modal_boundaries')
      .setTitle('Set Role Boundaries')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('upper')
            .setLabel('Upper boundary Role ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Booster roles go BELOW this role')
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('lower')
            .setLabel('Lower boundary Role ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Booster roles go ABOVE this role')
            .setRequired(false)
        )
      );
    return interaction.showModal(modal);
  }

  // ── Boundaries: modal submit ───────────────────────────────────────────────
  if (id === 'bsetup_modal_boundaries') {
    const upperId = interaction.fields.getTextInputValue('upper').trim();
    const lowerId = interaction.fields.getTextInputValue('lower').trim();

    if (upperId && !guild.roles.cache.get(upperId)) {
      return interaction.reply({ content: `❌ Upper role \`${upperId}\` not found.`, flags: MessageFlags.Ephemeral });
    }
    if (lowerId && !guild.roles.cache.get(lowerId)) {
      return interaction.reply({ content: `❌ Lower role \`${lowerId}\` not found.`, flags: MessageFlags.Ephemeral });
    }

    settings.boundaries.upperRoleId = upperId || null;
    settings.boundaries.lowerRoleId = lowerId || null;
    await settings.save();
    await interaction.deferUpdate();
    const { embed, rows } = await buildPanel('boundaries', guild, settings);
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Boundaries: clear ─────────────────────────────────────────────────────
  if (id === 'bsetup_boundaries_clear') {
    settings.boundaries.upperRoleId = null;
    settings.boundaries.lowerRoleId = null;
    await settings.save();
    const { embed, rows } = await buildPanel('boundaries', guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Rotation: toggle enabled ───────────────────────────────────────────────
  if (id === 'bsetup_rotation_toggle') {
    settings.rotation.enabled = !settings.rotation.enabled;
    await settings.save();
    const { embed, rows } = await buildPanel('rotation', guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Rotation: set frequency via modal ─────────────────────────────────────
  if (id === 'bsetup_rotation_frequency') {
    const modal = new ModalBuilder()
      .setCustomId('bsetup_modal_rotation')
      .setTitle('Set Rotation Frequency')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('frequency')
            .setLabel('Frequency (hourly/daily/weekly/monthly/custom)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. daily')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('custom_minutes')
            .setLabel('Custom interval in minutes (if frequency=custom)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 720 (= 12 hours)')
            .setRequired(false)
        )
      );
    return interaction.showModal(modal);
  }

  // ── Rotation: modal submit ─────────────────────────────────────────────────
  if (id === 'bsetup_modal_rotation') {
    const freq    = interaction.fields.getTextInputValue('frequency').trim().toLowerCase();
    const customM = interaction.fields.getTextInputValue('custom_minutes').trim();
    const valid   = ['hourly', 'daily', 'weekly', 'monthly', 'custom'];
    if (!valid.includes(freq)) {
      return interaction.reply({ content: `❌ Invalid frequency. Choose: ${valid.join(', ')}`, flags: MessageFlags.Ephemeral });
    }
    settings.rotation.frequency = freq;
    if (freq === 'custom' && customM) {
      const mins = parseInt(customM, 10);
      if (!isNaN(mins) && mins > 0) settings.rotation.customIntervalMinutes = mins;
    }
    await settings.save();
    await interaction.deferUpdate();
    const { embed, rows } = await buildPanel('rotation', guild, settings);
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Logging: set channel via modal ────────────────────────────────────────
  if (id === 'bsetup_logging_set') {
    const modal = new ModalBuilder()
      .setCustomId('bsetup_modal_logging')
      .setTitle('Set Log Channel')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Right-click channel → Copy ID')
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  // ── Logging: modal submit ─────────────────────────────────────────────────
  if (id === 'bsetup_modal_logging') {
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    const ch        = guild.channels.cache.get(channelId);
    if (!ch) {
      return interaction.reply({ content: `❌ Channel \`${channelId}\` not found.`, flags: MessageFlags.Ephemeral });
    }
    settings.logChannelId = channelId;
    await settings.save();
    await interaction.deferUpdate();
    const { embed, rows } = await buildPanel('logging', guild, settings);
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Logging: clear ────────────────────────────────────────────────────────
  if (id === 'bsetup_logging_clear') {
    settings.logChannelId = null;
    await settings.save();
    const { embed, rows } = await buildPanel('logging', guild, settings);
    return interaction.update({ embeds: [embed], components: rows });
  }

  // ── Retention: set via modal ──────────────────────────────────────────────
  if (id === 'bsetup_retention_set') {
    const modal = new ModalBuilder()
      .setCustomId('bsetup_modal_retention')
      .setTitle('Set Data Retention')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('days')
            .setLabel('Retention days (1–365)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 7')
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  // ── Retention: modal submit ───────────────────────────────────────────────
  if (id === 'bsetup_modal_retention') {
    const days = parseInt(interaction.fields.getTextInputValue('days').trim(), 10);
    if (isNaN(days) || days < 1 || days > 365) {
      return interaction.reply({ content: '❌ Enter a number between 1 and 365.', flags: MessageFlags.Ephemeral });
    }
    settings.retention.days = days;
    await settings.save();
    await interaction.deferUpdate();
    const { embed, rows } = await buildPanel('retention', guild, settings);
    return interaction.editReply({ embeds: [embed], components: rows });
  }
}

// ─── Panel builders ───────────────────────────────────────────────────────────

async function buildPanel(section, guild, settings) {
  const navRow = buildNavRow(section);

  switch (section) {
    case 'overview':      return { embed: await buildOverview(guild, settings), rows: [navRow] };
    case 'features':      return { embed: buildFeatures(settings),              rows: [navRow, ...buildFeatureButtons(settings)] };
    case 'required_role': return { embed: buildRequiredRole(guild, settings),   rows: [navRow, buildRequiredRoleButtons(settings)] };
    case 'boundaries':    return { embed: buildBoundaries(guild, settings),     rows: [navRow, buildBoundaryButtons(settings)] };
    case 'rotation':      return { embed: buildRotation(settings),              rows: [navRow, buildRotationButtons(settings)] };
    case 'logging':       return { embed: buildLogging(guild, settings),        rows: [navRow, buildLoggingButtons(settings)] };
    case 'retention':     return { embed: buildRetention(settings),             rows: [navRow, buildRetentionButtons()] };
    default:              return { embed: await buildOverview(guild, settings), rows: [navRow] };
  }
}

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bsetup_nav')
      .setPlaceholder('📋 Navigate to a section...')
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('📊 Overview').setValue('overview').setDefault(current === 'overview'),
        new StringSelectMenuOptionBuilder().setLabel('🎛️ Features').setValue('features').setDefault(current === 'features'),
        new StringSelectMenuOptionBuilder().setLabel('🔒 Required Role').setValue('required_role').setDefault(current === 'required_role'),
        new StringSelectMenuOptionBuilder().setLabel('📏 Boundaries').setValue('boundaries').setDefault(current === 'boundaries'),
        new StringSelectMenuOptionBuilder().setLabel('🔄 Rotation').setValue('rotation').setDefault(current === 'rotation'),
        new StringSelectMenuOptionBuilder().setLabel('📝 Logging').setValue('logging').setDefault(current === 'logging'),
        new StringSelectMenuOptionBuilder().setLabel('🗑️ Retention').setValue('retention').setDefault(current === 'retention'),
      ])
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function buildOverview(guild, settings) {
  const totalRoles   = await BoosterRole.countDocuments({ guildId: guild.id, active: true });
  const deletedRoles = await BoosterRole.countDocuments({ guildId: guild.id, active: false });

  const upper = settings.boundaries?.upperRoleId ? `<@&${settings.boundaries.upperRoleId}>` : '*Not set*';
  const lower = settings.boundaries?.lowerRoleId ? `<@&${settings.boundaries.lowerRoleId}>` : '*Not set*';
  const reqRole = settings.requiredRoleId ? `<@&${settings.requiredRoleId}>` : '*None*';
  const logCh   = settings.logChannelId   ? `<#${settings.logChannelId}>`    : '*Not set*';

  return new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('📊 Booster Module — Overview')
    .setDescription(`**${guild.name}** booster system status`)
    .addFields(
      { name: '🎨 Active Roles',      value: String(totalRoles),   inline: true },
      { name: '🗑️ Soft-Deleted',      value: String(deletedRoles), inline: true },
      { name: '🔒 Required Role',      value: reqRole,              inline: true },
      { name: '📏 Upper Boundary',     value: upper,                inline: true },
      { name: '📏 Lower Boundary',     value: lower,                inline: true },
      { name: '📝 Log Channel',        value: logCh,                inline: true },
      { name: '🔄 Rotation',           value: settings.rotation?.enabled ? `✅ Enabled (${settings.rotation.frequency})` : '❌ Disabled', inline: true },
      { name: '⏳ Retention',          value: `${settings.retention?.days ?? 7} days`,                                                    inline: true },
    )
    .setFooter({ text: 'Use the menu below to configure each section.' })
    .setTimestamp();
}

// ── Features ──────────────────────────────────────────────────────────────────

function buildFeatures(settings) {
  const f = settings.features;
  const row = (name, enabled) => `${enabled ? '✅' : '❌'} **${name}**`;

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎛️ Features')
    .setDescription('Click a button to toggle a feature on or off.')
    .addFields(
      { name: 'Custom Roles',         value: row('customRoles',       f.customRoles),       inline: true },
      { name: 'Role Sharing',         value: row('roleSharing',       f.roleSharing),       inline: true },
      { name: 'Custom VC',            value: row('customVC',          f.customVC),           inline: true },
      { name: 'Soft-Delete Restore',  value: row('softDeleteRestore', f.softDeleteRestore), inline: true },
      { name: 'Role Templates',       value: row('roleTemplates',     f.roleTemplates),     inline: true },
      { name: 'Role Backup',          value: row('roleBackup',        f.roleBackup),        inline: true },
      { name: 'Weekly Rotation',      value: row('weeklyRotation',    f.weeklyRotation),    inline: true },
      { name: 'Featured Voting',      value: row('featuredVoting',    f.featuredVoting),    inline: true },
      { name: 'Hall of Fame',         value: row('hallOfFame',        f.hallOfFame),        inline: true },
    );
}

function buildFeatureButtons(settings) {
  const f = settings.features;
  // Split into two rows of 5 (max 5 per row)
  const makeBtn = (label, feature, enabled) =>
    new ButtonBuilder()
      .setCustomId(`bsetup_toggle_${feature}`)
      .setLabel(label)
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const row1 = new ActionRowBuilder().addComponents(
    makeBtn('Custom Roles',    'customRoles',       f.customRoles),
    makeBtn('Role Sharing',    'roleSharing',       f.roleSharing),
    makeBtn('Custom VC',       'customVC',          f.customVC),
    makeBtn('Soft-Delete',     'softDeleteRestore', f.softDeleteRestore),
    makeBtn('Templates',       'roleTemplates',     f.roleTemplates),
  );
  const row2 = new ActionRowBuilder().addComponents(
    makeBtn('Role Backup',     'roleBackup',        f.roleBackup),
    makeBtn('Weekly Rotation', 'weeklyRotation',    f.weeklyRotation),
    makeBtn('Voting',          'featuredVoting',    f.featuredVoting),
    makeBtn('Hall of Fame',    'hallOfFame',        f.hallOfFame),
  );
  return [row1, row2];
}

// ── Required Role ─────────────────────────────────────────────────────────────

function buildRequiredRole(guild, settings) {
  const reqRole = settings.requiredRoleId
    ? `<@&${settings.requiredRoleId}> (\`${settings.requiredRoleId}\`)`
    : '*None — all boosters can create roles freely*';

  return new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('🔒 Required Role')
    .setDescription(
      'When a **Required Role** is set, members must have that role to create or keep a custom booster role.\n\n' +
      '**If a member loses the required role**, their booster role is automatically **soft-deleted** — ' +
      'the data is preserved and restored if they get the role back within the retention window.'
    )
    .addFields(
      { name: 'Current Required Role', value: reqRole },
      { name: 'Retention Window',      value: `${settings.retention?.days ?? 7} days (configure in Retention section)` },
    )
    .setFooter({ text: 'Enable Developer Mode → right-click a role → Copy ID to get the Role ID.' });
}

function buildRequiredRoleButtons(settings) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bsetup_required_role_set')
      .setLabel('Set Required Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bsetup_required_role_clear')
      .setLabel('Clear Required Role')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!settings.requiredRoleId),
  );
}

// ── Boundaries ────────────────────────────────────────────────────────────────

function buildBoundaries(guild, settings) {
  const upper = settings.boundaries?.upperRoleId
    ? `<@&${settings.boundaries.upperRoleId}>`
    : '*Not set*';
  const lower = settings.boundaries?.lowerRoleId
    ? `<@&${settings.boundaries.lowerRoleId}>`
    : '*Not set*';

  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('📏 Role Boundaries')
    .setDescription(
      'Booster roles are placed **between** the upper and lower boundary roles in the role list.\n\n' +
      'Set both boundaries to keep booster roles in a controlled zone. Leave unset to insert at the top.'
    )
    .addFields(
      { name: '⬆️ Upper Boundary (booster roles go below this)', value: upper },
      { name: '⬇️ Lower Boundary (booster roles go above this)', value: lower },
    )
    .setFooter({ text: 'Copy Role IDs via right-click → Copy ID (Developer Mode must be enabled).' });
}

function buildBoundaryButtons(settings) {
  const hasAny = settings.boundaries?.upperRoleId || settings.boundaries?.lowerRoleId;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bsetup_boundaries_set')
      .setLabel('Set Boundaries')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bsetup_boundaries_clear')
      .setLabel('Clear Boundaries')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasAny),
  );
}

// ── Rotation ──────────────────────────────────────────────────────────────────

function buildRotation(settings) {
  const r = settings.rotation;
  const freqLabel = r.frequency === 'custom'
    ? `Custom (${r.customIntervalMinutes ?? 1440} min)`
    : r.frequency ?? 'daily';

  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🔄 Rotation')
    .setDescription(
      '**Boundary Rotation** periodically re-positions all booster roles to stay inside the configured boundaries.\n\n' +
      '**Featured Rotation** randomly picks a different booster role to be featured at the top (controlled by the weekly rotation feature toggle).'
    )
    .addFields(
      { name: 'Boundary Rotation', value: r.enabled ? `✅ Enabled — ${freqLabel}` : '❌ Disabled' },
      { name: 'Featured Rotation', value: settings.features?.weeklyRotation ? `✅ Enabled — every ${r.interval ?? 7} day(s)` : '❌ Disabled (toggle in Features)' },
    );
}

function buildRotationButtons(settings) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bsetup_rotation_toggle')
      .setLabel(settings.rotation?.enabled ? 'Disable Boundary Rotation' : 'Enable Boundary Rotation')
      .setStyle(settings.rotation?.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('bsetup_rotation_frequency')
      .setLabel('Set Frequency')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!settings.rotation?.enabled),
  );
}

// ── Logging ───────────────────────────────────────────────────────────────────

function buildLogging(guild, settings) {
  const ch = settings.logChannelId ? `<#${settings.logChannelId}>` : '*Not configured*';

  return new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('📝 Audit Logging')
    .setDescription('All booster actions (role created, edited, deleted, restored, required role lost) are sent to the log channel.')
    .addFields({ name: 'Current Log Channel', value: ch });
}

function buildLoggingButtons(settings) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bsetup_logging_set')
      .setLabel('Set Log Channel')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bsetup_logging_clear')
      .setLabel('Clear Log Channel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!settings.logChannelId),
  );
}

// ── Retention ─────────────────────────────────────────────────────────────────

function buildRetention(settings) {
  const days = settings.retention?.days ?? 7;

  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🗑️ Data Retention')
    .setDescription(
      `Soft-deleted booster role data is kept for **${days} day(s)** before being permanently purged.\n\n` +
      'During this window, if a member re-boosts (or regains the required role), their custom role is fully restored. After the window expires, the data is gone and they would need to set up a new role.'
    )
    .addFields({ name: 'Current Retention', value: `${days} day(s)` });
}

function buildRetentionButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bsetup_retention_set')
      .setLabel('Change Retention Period')
      .setStyle(ButtonStyle.Primary),
  );
}


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
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import BoosterSettings from '../booster/models/BoosterSettings.js';
import BoosterRole from '../booster/models/BoosterRole.js';
import { isAdmin } from '../booster/utils/validators.js';
import { linkExistingRole, unlinkRole } from '../booster/services/roleService.js';

async function getSettings(guildId) {
  return BoosterSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true },
  );
}

function tick(bool)  { return bool ? '🟢' : '🔴'; }
function label(bool) { return bool ? 'Enabled' : 'Disabled'; }
function freq(f)     { return { hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom' }[f] ?? f; }

function navMenu(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bsetup_nav')
      .setPlaceholder('Navigate to a section...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('📊 Overview').setValue('overview').setDefault(current === 'overview'),
        new StringSelectMenuOptionBuilder().setLabel('🎨 Features').setValue('features').setDefault(current === 'features'),
        new StringSelectMenuOptionBuilder().setLabel('🎖️ Eligibility Role').setValue('eligibility').setDefault(current === 'eligibility'),
        new StringSelectMenuOptionBuilder().setLabel('📏 Boundaries').setValue('boundaries').setDefault(current === 'boundaries'),
        new StringSelectMenuOptionBuilder().setLabel('🔄 Rotation').setValue('rotation').setDefault(current === 'rotation'),
        new StringSelectMenuOptionBuilder().setLabel('📋 Logging').setValue('logging').setDefault(current === 'logging'),
        new StringSelectMenuOptionBuilder().setLabel('🗓️ Data Retention').setValue('retention').setDefault(current === 'retention'),
        new StringSelectMenuOptionBuilder().setLabel('🔗 Link Role').setValue('linkrole').setDefault(current === 'linkrole'),
        new StringSelectMenuOptionBuilder().setLabel('📈 System').setValue('system').setDefault(current === 'system'),
      ),
  );
}

async function buildOverview(settings, guild) {
  const upperRole = settings.boundaries.upperRoleId ? guild.roles.cache.get(settings.boundaries.upperRoleId) : null;
  const lowerRole = settings.boundaries.lowerRoleId ? guild.roles.cache.get(settings.boundaries.lowerRoleId) : null;
  const logCh     = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
  const eligRole  = settings.eligibilityRoleId ? guild.roles.cache.get(settings.eligibilityRoleId) : null;
  const activeCount   = await BoosterRole.countDocuments({ guildId: guild.id, active: true });
  const inactiveCount = await BoosterRole.countDocuments({ guildId: guild.id, active: false });

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('⚙️ Booster System — Overview')
    .addFields(
      { name: '🎨 Features',
        value: [
          `Custom Roles: ${tick(settings.features.customRoles)} ${label(settings.features.customRoles)}`,
          `Role Sharing:  ${tick(settings.features.roleSharing)} ${label(settings.features.roleSharing)}`,
          `Templates:     ${tick(settings.features.roleTemplates)} ${label(settings.features.roleTemplates)}`,
        ].join('\n'), inline: true },
      { name: '🎖️ Eligibility',
        value: eligRole ? `${eligRole}` : '*(native boosters only)*', inline: true },
      { name: '📏 Boundaries',
        value: upperRole && lowerRole ? `Upper: ${upperRole}\nLower: ${lowerRole}` : '⚠️ Not configured', inline: true },
      { name: '🔄 Rotation',
        value: settings.rotation.enabled ? `${tick(true)} ${freq(settings.rotation.frequency)}` : `${tick(false)} Disabled`, inline: true },
      { name: '📋 Logging',
        value: logCh ? `${logCh}` : '⚠️ No channel set', inline: true },
      { name: '🗓️ Retention',
        value: `**${settings.retention.days}** days`, inline: true },
      { name: '📈 Roles',
        value: `Active: **${activeCount}** | Inactive: **${inactiveCount}**`, inline: true },
    )
    .setFooter({ text: 'Use the menu below to configure each section.' })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

async function buildFeatures(settings) {
  const f = settings.features;
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🎨 Feature Toggles')
    .setDescription('Click a button to toggle a feature on or off.')
    .addFields(
      { name: `${tick(f.customRoles)} Custom Roles`,   value: 'Allows eligible members to create their own custom role', inline: true },
      { name: `${tick(f.roleSharing)} Role Sharing`,   value: 'Allows role owners to share with other members',          inline: true },
      { name: `${tick(f.roleTemplates)} Templates`,    value: 'Color templates available in the role wizard',            inline: true },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_toggle_customRoles')
      .setLabel(`${f.customRoles ? 'Disable' : 'Enable'} Custom Roles`)
      .setStyle(f.customRoles ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bsetup_toggle_roleSharing')
      .setLabel(`${f.roleSharing ? 'Disable' : 'Enable'} Role Sharing`)
      .setStyle(f.roleSharing ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bsetup_toggle_roleTemplates')
      .setLabel(`${f.roleTemplates ? 'Disable' : 'Enable'} Templates`)
      .setStyle(f.roleTemplates ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row] };
}

async function buildEligibility(settings, guild) {
  const role = settings.eligibilityRoleId ? guild.roles.cache.get(settings.eligibilityRoleId) : null;

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🎖️ Eligibility Role')
    .setDescription(
      'Set a role that grants members permission to use `.role setup`.\n' +
      'When a member loses this role, their custom role is automatically removed — just like losing a boost.\n\n' +
      '**If no role is set, only native Discord server boosters can create custom roles.**\n\n' +
      `**Current eligibility role:** ${role ? `${role}` : '⚠️ Not set (native boosters only)'}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_eligibility_open').setLabel('Set Role').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bsetup_eligibility_clear').setLabel('Clear').setStyle(ButtonStyle.Danger).setDisabled(!role),
  );

  return { embeds: [embed], components: [row] };
}

async function buildBoundaries(settings, guild) {
  const upper = settings.boundaries.upperRoleId ? guild.roles.cache.get(settings.boundaries.upperRoleId) : null;
  const lower = settings.boundaries.lowerRoleId ? guild.roles.cache.get(settings.boundaries.lowerRoleId) : null;

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('📏 Boundary Roles')
    .setDescription(
      'Booster roles are always placed **between** the upper and lower boundary roles.\n\n' +
      'To set boundaries, paste the **Role ID** for each (right-click role → Copy ID).'
    )
    .addFields(
      { name: 'Upper Boundary', value: upper ? `${upper} (\`${upper.id}\`)` : '⚠️ Not set', inline: true },
      { name: 'Lower Boundary', value: lower ? `${lower} (\`${lower.id}\`)` : '⚠️ Not set', inline: true },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_boundary_open').setLabel('Set Boundaries').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bsetup_boundary_clear').setLabel('Clear Boundaries').setStyle(ButtonStyle.Danger).setDisabled(!upper && !lower),
  );

  return { embeds: [embed], components: [row] };
}

async function buildRotation(settings) {
  const r = settings.rotation;
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🔄 Boundary Rotation')
    .setDescription(
      'The rotation service periodically checks that all active booster roles are within the configured boundaries.\n\n' +
      `**Status:** ${tick(r.enabled)} ${label(r.enabled)}\n` +
      `**Frequency:** ${r.enabled ? freq(r.frequency) : '—'}` +
      (r.frequency === 'custom' && r.enabled ? `\n**Interval:** ${r.customIntervalMinutes} minutes` : '')
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_rotation_toggle')
      .setLabel(r.enabled ? 'Disable Rotation' : 'Enable Rotation')
      .setStyle(r.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bsetup_rotation_freq')
      .setPlaceholder('Set rotation frequency...')
      .setDisabled(!r.enabled)
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Hourly').setValue('hourly').setDefault(r.frequency === 'hourly'),
        new StringSelectMenuOptionBuilder().setLabel('Daily').setValue('daily').setDefault(r.frequency === 'daily'),
        new StringSelectMenuOptionBuilder().setLabel('Weekly').setValue('weekly').setDefault(r.frequency === 'weekly'),
        new StringSelectMenuOptionBuilder().setLabel('Monthly').setValue('monthly').setDefault(r.frequency === 'monthly'),
        new StringSelectMenuOptionBuilder().setLabel('Custom interval').setValue('custom').setDefault(r.frequency === 'custom'),
      ),
  );

  return { embeds: [embed], components: r.enabled ? [row1, row2] : [row1] };
}

async function buildLogging(settings, guild) {
  const ch = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('📋 Logging')
    .setDescription(
      'The bot will send a message to the configured channel whenever a role is created, edited, deleted, or a cleanup runs.\n\n' +
      `**Current log channel:** ${ch ? `${ch}` : '⚠️ Not set'}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_log_open').setLabel('Set Log Channel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bsetup_log_clear').setLabel('Clear').setStyle(ButtonStyle.Danger).setDisabled(!ch),
  );

  return { embeds: [embed], components: [row] };
}

async function buildRetention(settings) {
  const days = settings.retention.days;
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🗓️ Data Retention')
    .setDescription(
      'When a member loses eligibility, their role data is preserved so it can be restored if they regain it.\n\n' +
      'After the retention period expires, the data is **permanently deleted**.\n\n' +
      `**Current retention period:** **${days} days**`
    );

  const presets = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_retention_set_30').setLabel('30d').setStyle(days === 30 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bsetup_retention_set_60').setLabel('60d').setStyle(days === 60 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bsetup_retention_set_90').setLabel('90d').setStyle(days === 90 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bsetup_retention_set_180').setLabel('180d').setStyle(days === 180 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bsetup_retention_open').setLabel('Custom').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [presets] };
}

async function buildLinkRole(guild) {
  const linked = await BoosterRole.find({ guildId: guild.id, manuallyLinked: true, active: true }).lean();

  const lines = await Promise.all(linked.map(async doc => {
    const role   = guild.roles.cache.get(doc.roleId);
    const member = guild.members.cache.get(doc.userId)
                ?? await guild.members.fetch(doc.userId).catch(() => null);
    const userTag = member ? `<@${doc.userId}>` : `\`${doc.userId}\``;
    const roleTag = role ? `<@&${doc.roleId}>` : `\`${doc.roleId}\` *(deleted)*`;
    return `${userTag} → ${roleTag}`;
  }));

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('🔗 Link Role to Member')
    .setDescription(
      'Link a manually created Discord role to a member\'s booster profile.\n' +
      'Once linked, that member can use `.role give` and `.role remove` to share it.\n\n' +
      (lines.length ? `**Currently linked (${lines.length}):**\n${lines.join('\n')}` : '*No manually linked roles yet.*')
    )
    .setFooter({ text: 'Unlinking removes the bot record but does NOT delete the Discord role.' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bsetup_link_open').setLabel('Link a Role').setStyle(ButtonStyle.Primary),
    ),
  ];

  if (linked.length > 0) {
    const options = linked.slice(0, 25).map(doc => {
      const role   = guild.roles.cache.get(doc.roleId);
      const member = guild.members.cache.get(doc.userId);
      return new StringSelectMenuOptionBuilder()
        .setLabel(member?.displayName ?? doc.userId)
        .setDescription(role ? `@${role.name}` : 'Role deleted from server')
        .setValue(doc.userId);
    });
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bsetup_unlink_select')
          .setPlaceholder('Select a member to unlink...')
          .addOptions(options),
      ),
    );
  }

  return { embeds: [embed], components: rows };
}

async function buildSystem(guildId, guild) {
  const activeRoles    = await BoosterRole.countDocuments({ guildId, active: true });
  const inactiveRoles  = await BoosterRole.countDocuments({ guildId, active: false });
  const manuallyLinked = await BoosterRole.countDocuments({ guildId, active: true, manuallyLinked: true });

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle('📈 System Statistics')
    .addFields(
      { name: '🎨 Active Roles',    value: String(activeRoles),    inline: true },
      { name: '💤 Inactive Roles',  value: String(inactiveRoles),  inline: true },
      { name: '🔗 Linked Roles',    value: String(manuallyLinked), inline: true },
      { name: '🏠 Server',          value: guild.name,             inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bsetup_stats').setLabel('↻ Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bsetup_reset_open').setLabel('Reset All Settings').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

async function getSectionPayload(section, settings, guild) {
  let body;
  switch (section) {
    case 'features':     body = await buildFeatures(settings);              break;
    case 'eligibility':  body = await buildEligibility(settings, guild);    break;
    case 'boundaries':   body = await buildBoundaries(settings, guild);     break;
    case 'rotation':     body = await buildRotation(settings);              break;
    case 'logging':      body = await buildLogging(settings, guild);        break;
    case 'retention':    body = await buildRetention(settings);             break;
    case 'linkrole':     body = await buildLinkRole(guild);                 break;
    case 'system':       body = await buildSystem(settings.guildId, guild); break;
    default:             body = await buildOverview(settings, guild);       break;
  }
  return {
    embeds:     body.embeds,
    components: [navMenu(section), ...body.components],
  };
}

export const data = new SlashCommandBuilder()
  .setName('bsetup')
  .setDescription('Configure the booster role system for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const settings = await getSettings(interaction.guild.id);
  const payload  = await getSectionPayload('overview', settings, interaction.guild);
  await interaction.editReply(payload);
}

export async function handleComponent(interaction, client) {
  const id      = interaction.customId;
  const guildId = interaction.guild.id;
  const member  = interaction.guild.members.cache.get(interaction.user.id);

  if (!isAdmin(member)) {
    return interaction.reply({ content: '⛔ Admin only.', flags: MessageFlags.Ephemeral });
  }

  if (id === 'bsetup_nav') {
    const section  = interaction.values[0];
    const settings = await getSettings(guildId);
    const payload  = await getSectionPayload(section, settings, interaction.guild);
    return interaction.update(payload);
  }

  if (id.startsWith('bsetup_toggle_')) {
    const key      = id.replace('bsetup_toggle_', '');
    const settings = await getSettings(guildId);
    if (settings.features[key] === undefined) return interaction.reply({ content: '❌ Unknown feature.', flags: MessageFlags.Ephemeral });
    settings.features[key] = !settings.features[key];
    await settings.save();
    const payload = await getSectionPayload('features', settings, interaction.guild);
    return interaction.update(payload);
  }

  // ── Eligibility role ───────────────────────────────────────────────────────
  if (id === 'bsetup_eligibility_open') {
    const settings = await getSettings(guildId);
    return interaction.showModal(
      new ModalBuilder().setCustomId('bsetup_eligibility_modal').setTitle('Set Eligibility Role')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Role ID')
              .setStyle(TextInputStyle.Short).setRequired(true)
              .setPlaceholder('Right-click the role → Copy ID')
              .setValue(settings.eligibilityRoleId ?? ''),
          ),
        ),
    );
  }

  if (id === 'bsetup_eligibility_modal') {
    const roleId = interaction.fields.getTextInputValue('role_id').trim();
    const role   = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: `❌ Role ID \`${roleId}\` not found.`, flags: MessageFlags.Ephemeral });
    const settings = await getSettings(guildId);
    settings.eligibilityRoleId = roleId;
    await settings.save();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await getSectionPayload('eligibility', settings, interaction.guild);
    return interaction.editReply(payload);
  }

  if (id === 'bsetup_eligibility_clear') {
    const settings = await getSettings(guildId);
    settings.eligibilityRoleId = null;
    await settings.save();
    const payload = await getSectionPayload('eligibility', settings, interaction.guild);
    return interaction.update(payload);
  }

  // ── Boundaries ─────────────────────────────────────────────────────────────
  if (id === 'bsetup_boundary_open') {
    const settings = await getSettings(guildId);
    return interaction.showModal(
      new ModalBuilder().setCustomId('bsetup_boundary_modal').setTitle('Set Boundary Roles')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('upper_id').setLabel('Upper boundary role ID')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Right-click role → Copy ID')
              .setValue(settings.boundaries.upperRoleId ?? ''),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('lower_id').setLabel('Lower boundary role ID')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Right-click role → Copy ID')
              .setValue(settings.boundaries.lowerRoleId ?? ''),
          ),
        ),
    );
  }

  if (id === 'bsetup_boundary_modal') {
    const upperId   = interaction.fields.getTextInputValue('upper_id').trim();
    const lowerId   = interaction.fields.getTextInputValue('lower_id').trim();
    const upperRole = interaction.guild.roles.cache.get(upperId);
    const lowerRole = interaction.guild.roles.cache.get(lowerId);
    if (!upperRole) return interaction.reply({ content: `❌ Upper role ID \`${upperId}\` not found.`, flags: MessageFlags.Ephemeral });
    if (!lowerRole) return interaction.reply({ content: `❌ Lower role ID \`${lowerId}\` not found.`, flags: MessageFlags.Ephemeral });
    if (upperRole.position <= lowerRole.position) return interaction.reply({ content: '❌ Upper boundary must be higher in the role list than the lower boundary.', flags: MessageFlags.Ephemeral });
    const settings = await getSettings(guildId);
    settings.boundaries.upperRoleId = upperId;
    settings.boundaries.lowerRoleId = lowerId;
    await settings.save();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await getSectionPayload('boundaries', settings, interaction.guild);
    return interaction.editReply(payload);
  }

  if (id === 'bsetup_boundary_clear') {
    const settings = await getSettings(guildId);
    settings.boundaries.upperRoleId = null;
    settings.boundaries.lowerRoleId = null;
    await settings.save();
    const payload = await getSectionPayload('boundaries', settings, interaction.guild);
    return interaction.update(payload);
  }

  // ── Rotation ───────────────────────────────────────────────────────────────
  if (id === 'bsetup_rotation_toggle') {
    const settings = await getSettings(guildId);
    settings.rotation.enabled = !settings.rotation.enabled;
    await settings.save();
    const { rescheduleGuild } = await import('../booster/services/rotationService.js');
    await rescheduleGuild(guildId).catch(() => {});
    const payload = await getSectionPayload('rotation', settings, interaction.guild);
    return interaction.update(payload);
  }

  if (id === 'bsetup_rotation_freq') {
    const freq     = interaction.values[0];
    const settings = await getSettings(guildId);
    if (freq === 'custom') {
      return interaction.showModal(
        new ModalBuilder().setCustomId('bsetup_rotation_custom_modal').setTitle('Custom Rotation Interval')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('interval_minutes').setLabel('Interval in minutes (min: 30)')
                .setStyle(TextInputStyle.Short).setRequired(true)
                .setValue(String(settings.rotation.customIntervalMinutes ?? 1440)),
            ),
          ),
      );
    }
    settings.rotation.frequency = freq;
    await settings.save();
    const { rescheduleGuild } = await import('../booster/services/rotationService.js');
    await rescheduleGuild(guildId).catch(() => {});
    const payload = await getSectionPayload('rotation', settings, interaction.guild);
    return interaction.update(payload);
  }

  if (id === 'bsetup_rotation_custom_modal') {
    const minutes = parseInt(interaction.fields.getTextInputValue('interval_minutes'), 10);
    if (isNaN(minutes) || minutes < 30) return interaction.reply({ content: '❌ Minimum interval is 30 minutes.', flags: MessageFlags.Ephemeral });
    const settings = await getSettings(guildId);
    settings.rotation.frequency             = 'custom';
    settings.rotation.customIntervalMinutes = minutes;
    await settings.save();
    const { rescheduleGuild } = await import('../booster/services/rotationService.js');
    await rescheduleGuild(guildId).catch(() => {});
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await getSectionPayload('rotation', settings, interaction.guild);
    return interaction.editReply(payload);
  }

  // ── Logging ────────────────────────────────────────────────────────────────
  if (id === 'bsetup_log_open') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('bsetup_log_modal').setTitle('Set Log Channel')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Log channel ID')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Right-click channel → Copy ID')
              .setValue((await getSettings(guildId)).logChannelId ?? ''),
          ),
        ),
    );
  }

  if (id === 'bsetup_log_modal') {
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    const channel   = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: `❌ Channel ID \`${channelId}\` not found.`, flags: MessageFlags.Ephemeral });
    const settings = await getSettings(guildId);
    settings.logChannelId = channelId;
    await settings.save();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await getSectionPayload('logging', settings, interaction.guild);
    return interaction.editReply(payload);
  }

  if (id === 'bsetup_log_clear') {
    const settings = await getSettings(guildId);
    settings.logChannelId = null;
    await settings.save();
    const payload = await getSectionPayload('logging', settings, interaction.guild);
    return interaction.update(payload);
  }

  // ── Retention ──────────────────────────────────────────────────────────────
  if (id.startsWith('bsetup_retention_set_')) {
    const days = parseInt(id.replace('bsetup_retention_set_', ''), 10);
    if (isNaN(days)) return;
    const settings = await getSettings(guildId);
    settings.retention.days = days;
    await settings.save();
    const payload = await getSectionPayload('retention', settings, interaction.guild);
    return interaction.update(payload);
  }

  if (id === 'bsetup_retention_open') {
    const settings = await getSettings(guildId);
    return interaction.showModal(
      new ModalBuilder().setCustomId('bsetup_retention_modal').setTitle('Custom Retention Period')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('days').setLabel('Retention period in days (1–365)')
              .setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings.retention.days)),
          ),
        ),
    );
  }

  if (id === 'bsetup_retention_modal') {
    const days = parseInt(interaction.fields.getTextInputValue('days'), 10);
    if (isNaN(days) || days < 1 || days > 365) return interaction.reply({ content: '❌ Enter a number between 1 and 365.', flags: MessageFlags.Ephemeral });
    const settings = await getSettings(guildId);
    settings.retention.days = days;
    await settings.save();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await getSectionPayload('retention', settings, interaction.guild);
    return interaction.editReply(payload);
  }

  // ── Link Role ──────────────────────────────────────────────────────────────
  if (id === 'bsetup_link_open') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('bsetup_link_modal').setTitle('Link Existing Role to Member')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('Member ID')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Right-click member → Copy ID'),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Role ID')
              .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Right-click role → Copy ID'),
          ),
        ),
    );
  }

  if (id === 'bsetup_link_modal') {
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    const roleId = interaction.fields.getTextInputValue('role_id').trim();
    try {
      const { doc, discordRole } = await linkExistingRole(interaction.guild, userId, roleId);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = await getSectionPayload('linkrole', await getSettings(guildId), interaction.guild);
      payload.embeds[0] = EmbedBuilder.from(payload.embeds[0])
        .setDescription(`✅ Linked <@&${discordRole.id}> to <@${userId}>.\n\n` + payload.embeds[0].data.description);
      return interaction.editReply(payload);
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  if (id === 'bsetup_unlink_select') {
    const userId = interaction.values[0];
    try {
      const doc = await unlinkRole(interaction.guild, userId);
      const payload = await getSectionPayload('linkrole', await getSettings(guildId), interaction.guild);
      payload.embeds[0] = EmbedBuilder.from(payload.embeds[0])
        .setDescription(`✅ Unlinked role from <@${userId}>. The Discord role was not deleted.\n\n` + (payload.embeds[0].data.description ?? ''));
      return interaction.update(payload);
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // ── System ─────────────────────────────────────────────────────────────────
  if (id === 'bsetup_stats') {
    const settings = await getSettings(guildId);
    const payload  = await getSectionPayload('system', settings, interaction.guild);
    return interaction.update(payload);
  }

  if (id === 'bsetup_reset_open') {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⚠️ Reset All Settings')
        .setDescription('This will reset **all** booster configuration to defaults. Role records in the database are NOT affected.')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bsetup_reset_confirm').setLabel('Reset Settings').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bsetup_reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (id === 'bsetup_reset_confirm') {
    await BoosterSettings.findOneAndDelete({ guildId });
    await getSettings(guildId);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Settings have been reset to defaults.')],
      components: [],
    });
  }

  if (id === 'bsetup_reset_cancel') {
    const settings = await getSettings(guildId);
    const payload  = await getSectionPayload('system', settings, interaction.guild);
    return interaction.update(payload);
  }
}

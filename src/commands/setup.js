import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

const GAME_LABELS = {
  flag:           '🏳️  Flag Guess',
  wordBackwards:  '🔤 Word Backwards',
  buttonRace:     '⚡ Button Race',
  colorPicker:    '🎨 Color Picker',
  math:           '🧮 Math Quiz',
  trivia:         '🧠 Trivia',
  wouldYouRather: '🤔 Would You Rather',
  numberSequence: '🔢 Number Sequence',
};

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure Takina Games for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const cfg = client.config.get(interaction.guild.id);
  await interaction.editReply(buildMainPanel(interaction.guild, cfg));
}

export async function handleComponent(interaction, client) {
  const id      = interaction.customId;
  const guildId = interaction.guild.id;

  // ── Back to main panel ─────────────────────────────────────────────────────
  if (id === 'setup_back') {
    return interaction.update(buildMainPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Toggle enable / disable ────────────────────────────────────────────────
  if (id === 'setup_toggle') {
    const cfg  = client.config.get(guildId);
    const next = !cfg.enabled;
    client.config.set(guildId, { enabled: next });
    if (next) client.scheduler.startGuild(guildId);
    else      client.scheduler.stopGuild(guildId);
    return interaction.update(buildMainPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Game interval modal ────────────────────────────────────────────────────
  if (id === 'setup_interval') {
    const cfg = client.config.get(guildId);
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('setup_interval_modal')
        .setTitle('⏱️ Game Interval')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('setup_min_field')
              .setLabel('Minimum minutes between games')
              .setStyle(TextInputStyle.Short)
              .setRequired(true).setMinLength(1).setMaxLength(3)
              .setValue(String(cfg.minInterval))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('setup_max_field')
              .setLabel('Maximum minutes between games')
              .setStyle(TextInputStyle.Short)
              .setRequired(true).setMinLength(1).setMaxLength(3)
              .setValue(String(cfg.maxInterval))
          ),
        )
    );
  }

  if (id === 'setup_interval_modal') {
    let min = parseInt(interaction.fields.getTextInputValue('setup_min_field'), 10);
    let max = parseInt(interaction.fields.getTextInputValue('setup_max_field'), 10);
    if (isNaN(min) || isNaN(max) || min < 1 || max < 1) {
      return interaction.reply({ content: '❌ Enter valid numbers between 1 and 180.', ephemeral: true });
    }
    if (min > max) [min, max] = [max, min];
    min = Math.min(min, 180); max = Math.min(max, 180);
    client.config.set(guildId, { minInterval: min, maxInterval: max });
    const cfg = client.config.get(guildId);
    if (cfg.enabled) { client.scheduler.stopGuild(guildId); client.scheduler.startGuild(guildId); }
    await interaction.deferUpdate();
    return interaction.message.edit(buildMainPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Game timeout modal ─────────────────────────────────────────────────────
  if (id === 'setup_timeout') {
    const cfg = client.config.get(guildId);
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('setup_timeout_modal')
        .setTitle('⏰ Game Answer Time')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('setup_timeout_field')
              .setLabel('Seconds players have to answer (10–300)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true).setMinLength(2).setMaxLength(3)
              .setPlaceholder('e.g. 30')
              .setValue(String(cfg.gameTimeoutSeconds ?? 30))
          ),
        )
    );
  }

  if (id === 'setup_timeout_modal') {
    const raw = parseInt(interaction.fields.getTextInputValue('setup_timeout_field'), 10);
    if (isNaN(raw) || raw < 10 || raw > 300) {
      return interaction.reply({ content: '❌ Enter a number between 10 and 300 seconds.', ephemeral: true });
    }
    client.config.set(guildId, { gameTimeoutSeconds: raw });
    await interaction.deferUpdate();
    return interaction.message.edit(buildMainPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Roles view ─────────────────────────────────────────────────────────────
  if (id === 'setup_roles') {
    return interaction.update(buildRolesPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_role_add_select') {
    const cfg    = client.config.get(guildId);
    const botTop = interaction.guild.members.me.roles.highest.position;
    const added   = [];
    const skipped = [];
    for (const roleId of interaction.values) {
      const role = interaction.guild.roles.cache.get(roleId);
      if (role && role.position >= botTop) { skipped.push(role.name); continue; }
      if (!cfg.rewardRoleIds.includes(roleId)) added.push(roleId);
    }
    client.config.set(guildId, { rewardRoleIds: [...new Set([...cfg.rewardRoleIds, ...added])] });
    const panel = buildRolesPanel(interaction.guild, client.config.get(guildId));
    if (skipped.length) panel.content = `⚠️ Skipped **${skipped.join(', ')}** — above my highest role.`;
    return interaction.update(panel);
  }

  if (id === 'setup_role_remove_select') {
    const toRemove = new Set(interaction.values);
    const cfg = client.config.get(guildId);
    client.config.set(guildId, { rewardRoleIds: cfg.rewardRoleIds.filter(r => !toRemove.has(r)) });
    return interaction.update(buildRolesPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_role_clear') {
    client.config.set(guildId, { rewardRoleIds: [] });
    return interaction.update(buildRolesPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Channels view ──────────────────────────────────────────────────────────
  if (id === 'setup_channels') {
    return interaction.update(buildChannelsPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_channel_add_select') {
    const cfg    = client.config.get(guildId);
    const merged = [...new Set([...cfg.allowedChannels, ...interaction.values])];
    client.config.set(guildId, { allowedChannels: merged });
    return interaction.update(buildChannelsPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_channel_remove_select') {
    const toRemove = new Set(interaction.values);
    const cfg = client.config.get(guildId);
    client.config.set(guildId, { allowedChannels: cfg.allowedChannels.filter(c => !toRemove.has(c)) });
    return interaction.update(buildChannelsPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_channel_clear') {
    client.config.set(guildId, { allowedChannels: [] });
    return interaction.update(buildChannelsPanel(interaction.guild, client.config.get(guildId)));
  }

  // ── Games view ─────────────────────────────────────────────────────────────
  if (id === 'setup_games') {
    return interaction.update(buildGamesPanel(interaction.guild, client.config.get(guildId)));
  }

  if (id === 'setup_game_select') {
    const enabled = new Set(interaction.values);
    for (const key of Object.keys(GAME_LABELS)) {
      client.config.setGame(guildId, key, enabled.has(key));
    }
    return interaction.update(buildGamesPanel(interaction.guild, client.config.get(guildId)));
  }
}

// ─── Panel builders ────────────────────────────────────────────────────────────

function buildMainPanel(guild, cfg) {
  const roleList = cfg.rewardRoleIds.length
    ? cfg.rewardRoleIds.map(id => `<@&${id}>`).join('\n')
    : 'None — click **Reward Roles** to add';
  const channelList = cfg.allowedChannels.length
    ? cfg.allowedChannels.map(id => `<#${id}>`).join(', ')
    : 'Any active channel';
  const gamesList = Object.entries(GAME_LABELS)
    .map(([key, label]) => `${cfg.games[key] ? '✅' : '❌'} ${label}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(cfg.enabled ? 0x57F287 : 0xED4245)
    .setTitle('🎮 Takina Games — Setup')
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { name: '📡 Status',        value: cfg.enabled ? '✅ Active' : '🔴 Disabled', inline: true },
      { name: '⏱️ Interval',      value: `${cfg.minInterval}–${cfg.maxInterval} min`, inline: true },
      { name: '⏰ Answer Time',   value: `${cfg.gameTimeoutSeconds ?? 30}s per game`, inline: true },
      { name: '🎁 Reward Roles (1/5 chance, random)', value: roleList },
      { name: '📌 Game Channels', value: channelList },
      { name: '🎲 Games',         value: gamesList },
    )
    .setFooter({ text: 'Use the buttons below to change any setting' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_toggle')
      .setLabel(cfg.enabled ? 'Disable Games' : 'Enable Games')
      .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup_interval')
      .setLabel('Set Interval')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_timeout')
      .setLabel('Answer Time')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_roles')
      .setLabel('Reward Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_channels')
      .setLabel('Channels')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_games')
      .setLabel('Games')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildRolesPanel(guild, cfg) {
  const roleList = cfg.rewardRoleIds.length
    ? cfg.rewardRoleIds.map(id => `• <@&${id}>`).join('\n')
    : 'No roles in pool yet.';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎁 Reward Roles')
    .setDescription(
      `One role is picked **randomly** when a winner earns a reward (1 in 5 chance).\n\n**Current pool:**\n${roleList}`
    )
    .setFooter({ text: 'Add roles ↓ • Remove roles ↓ • ← Back to return' });

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_role_add_select')
      .setPlaceholder('➕ Select roles to add to the pool')
      .setMinValues(1).setMaxValues(10),
  ));

  if (cfg.rewardRoleIds.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup_role_remove_select')
        .setPlaceholder('➖ Select roles to remove')
        .setMinValues(1).setMaxValues(cfg.rewardRoleIds.length)
        .addOptions(cfg.rewardRoleIds.map(id => {
          const role = guild.roles.cache.get(id);
          return new StringSelectMenuOptionBuilder()
            .setLabel(role ? role.name : `Unknown (${id})`)
            .setValue(id).setEmoji('🗑️');
        })),
    ));
  }

  const btns = [new ButtonBuilder().setCustomId('setup_back').setLabel('← Back').setStyle(ButtonStyle.Secondary)];
  if (cfg.rewardRoleIds.length) {
    btns.push(new ButtonBuilder().setCustomId('setup_role_clear').setLabel('Clear All').setStyle(ButtonStyle.Danger));
  }
  rows.push(new ActionRowBuilder().addComponents(btns));

  return { embeds: [embed], components: rows };
}

function buildChannelsPanel(guild, cfg) {
  const channelList = cfg.allowedChannels.length
    ? cfg.allowedChannels.map(id => `• <#${id}>`).join('\n')
    : 'No restrictions — games appear in any active text channel.';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📌 Game Channels')
    .setDescription(
      `Restrict which channels games appear in. Leave empty to allow any active channel.\n\n**Current:**\n${channelList}`
    )
    .setFooter({ text: 'Add channels ↓ • Remove channels ↓ • ← Back to return' });

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup_channel_add_select')
      .setPlaceholder('➕ Select channels to add')
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1).setMaxValues(10),
  ));

  if (cfg.allowedChannels.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup_channel_remove_select')
        .setPlaceholder('➖ Select channels to remove')
        .setMinValues(1).setMaxValues(cfg.allowedChannels.length)
        .addOptions(cfg.allowedChannels.map(id => {
          const ch = guild.channels.cache.get(id);
          return new StringSelectMenuOptionBuilder()
            .setLabel(ch ? `#${ch.name}` : `Unknown (${id})`)
            .setValue(id).setEmoji('🗑️');
        })),
    ));
  }

  const btns = [new ButtonBuilder().setCustomId('setup_back').setLabel('← Back').setStyle(ButtonStyle.Secondary)];
  if (cfg.allowedChannels.length) {
    btns.push(new ButtonBuilder().setCustomId('setup_channel_clear').setLabel('Clear All').setStyle(ButtonStyle.Danger));
  }
  rows.push(new ActionRowBuilder().addComponents(btns));

  return { embeds: [embed], components: rows };
}

function buildGamesPanel(guild, cfg) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎲 Toggle Games')
    .setDescription(
      'Select which games you want **enabled**. Unselected games will be disabled.\n\n' +
      Object.entries(GAME_LABELS).map(([key, label]) => `${cfg.games[key] ? '✅' : '❌'} ${label}`).join('\n')
    )
    .setFooter({ text: 'Pick the games you want active, then submit' });

  const options = Object.entries(GAME_LABELS).map(([key, label]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(label.replace(/^[\S]+\s+/, ''))
      .setValue(key)
      .setEmoji(label.split(' ')[0])
      .setDefault(cfg.games[key] ?? true)
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('setup_game_select')
          .setPlaceholder('Select games to enable...')
          .setMinValues(0).setMaxValues(Object.keys(GAME_LABELS).length)
          .addOptions(options),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export default { data, execute, handleComponent };

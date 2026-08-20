import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { isAdmin } from '../booster/utils/validators.js';
import { log } from '../booster/utils/logger.js';
import { getAllCategories, getEmojisByCategory } from '../utils/defaultEmojis.js';

export const data = new SlashCommandBuilder()
  .setName('emoji-config')
  .setDescription('Manage custom emojis for this server')
  .setDefaultMemberPermissions('0');

export async function execute(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isAdmin(member)) {
    return interaction.reply({
      content: '❌ Only admins can manage emoji configuration.',
      ephemeral: true,
    });
  }

  const emojiManager = interaction.client.emojiManager;
  const dashboardConfig = await emojiManager.getConfigForDashboard(interaction.guildId);

  const categories = getAllCategories();
  const embed = buildMainPanel(dashboardConfig, categories);
  const categoryButtons = buildCategoryRows(categories);

  return interaction.reply({
    embeds: [embed],
    components: categoryButtons,
    ephemeral: true,
  });
}

function buildCategoryRows(categories) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 5) {
    const slice = categories.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      ...slice.map((cat) =>
        new ButtonBuilder()
          .setCustomId(`emoji_category_${cat}`)
          .setLabel(cat.toUpperCase())
          .setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }
  return rows;
}

export function buildMainPanel(dashboardConfig, categories) {
  const totalEmojis = Object.values(dashboardConfig).reduce((acc, cat) => {
    return acc + Object.keys(cat).length;
  }, 0);

  const customEmojis = Object.values(dashboardConfig).reduce((acc, cat) => {
    return acc + Object.values(cat).filter((e) => e.isCustom).length;
  }, 0);

  const fields = categories.map((cat) => {
    const catEmojis = dashboardConfig[cat] || {};
    const customCount = Object.values(catEmojis).filter((e) => e.isCustom).length;
    const totalCount = Object.keys(catEmojis).length;
    return {
      name: `${cat.toUpperCase()}`,
      value: `${totalCount} emojis${customCount > 0 ? ` • ${customCount} custom` : ''}`,
      inline: true,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎨 Emoji Configuration')
    .setDescription(
      `Manage custom emojis for this server. Click a category to view and modify emojis.\n\n` +
      `**Total Emojis:** ${totalEmojis}\n` +
      `**Custom Overrides:** ${customEmojis}`
    )
    .addFields(fields)
    .setFooter({ text: 'Select a category to manage emojis' });

  return embed;
}

export function buildCategoryPanel(category, categoryEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎨 ${category.toUpperCase()} Emojis`)
    .setDescription('Select an emoji from the dropdown to modify it.');

  const fields = Object.entries(categoryEmojis).map(([key, emoji]) => {
    const status = emoji.isCustom ? '✨ CUSTOM' : '📌 DEFAULT';
    const display = emoji.current?.display || emoji.default;
    return {
      name: `${display} ${emoji.label}`,
      value: `\`${key}\` — ${status}`,
      inline: true,
    };
  });

  embed.addFields(fields);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_${category}`)
    .setPlaceholder('Select an emoji to modify...')
    .addOptions(
      Object.entries(categoryEmojis).map(([key, emoji]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(emoji.label)
          .setValue(key)
          .setEmoji(emoji.current?.display || emoji.default)
          .setDescription(emoji.isCustom ? 'Custom emoji' : 'Using default')
      )
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emoji_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    selectRow: new ActionRowBuilder().addComponents(selectMenu),
    buttonRow: buttons,
  };
}

export function buildEmojiDetailsPanel(emojiKey, emojiData, serverEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle(`Modify: ${emojiData.label}`)
    .setDescription(
      `**Current:** ${emojiData.current?.display || emojiData.default}\n` +
      `**Default:** ${emojiData.default}\n` +
      `**Type:** ${emojiData.isCustom ? 'Custom Emoji' : 'Unicode Emoji'}`
    );

  embed.addFields(
    { name: 'Key', value: `\`${emojiKey}\``, inline: true },
    { name: 'Category', value: `${emojiData.category || 'misc'}`, inline: true }
  );

  if (emojiData.current) {
    embed.addFields(
      { name: 'Custom Emoji ID', value: emojiData.current.id, inline: false },
      { name: 'Source Server', value: emojiData.current.server, inline: false }
    );
  }

  const serverOptions = serverEmojis.map((server) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${server.name} (${server.emojiCount})`)
      .setValue(`server_${server.id}`)
      .setDescription('Select emojis from this server')
  );

  const serverSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_server_select_${emojiKey}`)
    .setPlaceholder('Choose a server for custom emojis...')
    .addOptions(
      serverOptions.length
        ? serverOptions
        : [new StringSelectMenuOptionBuilder().setLabel('No servers with emojis').setValue('none').setDescription('Invite bot to a server with custom emojis')]
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoji_reset_${emojiKey}`)
      .setLabel('Reset to Default')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`emoji_back_category_${emojiData.category || 'status'}`)
      .setLabel('⬅️ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    serverSelectRow: new ActionRowBuilder().addComponents(serverSelect),
    buttonRow: buttons,
  };
}

export function buildServerEmojiPicker(emojiKey, serverName, serverEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`Select Emoji from ${serverName}`)
    .setDescription(`Choose a custom emoji to use for **${emojiKey}**\n\nShowing ${Math.min(serverEmojis.length, 25)} of ${serverEmojis.length} emojis (Discord allows up to 25 choices).`);

  const options = serverEmojis.slice(0, 25).map((emoji) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(emoji.name.slice(0, 100))
      .setValue(`emoji_${emoji.id}`)
      .setEmoji(emoji.unicode)
  );

  const emojiSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_from_server_${emojiKey}`)
    .setPlaceholder('Select custom emoji...')
    .addOptions(options);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emoji_cancel_picker').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    emojiSelectRow: new ActionRowBuilder().addComponents(emojiSelect),
    buttonRow: buttons,
  };
}

log('info', 'EmojiConfig', 'Emoji configuration command loaded');

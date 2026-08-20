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
      name: `${categoryIcon(cat)} ${cat.toUpperCase()}`,
      value: customCount > 0
        ? `${totalCount} emojis\n✨ ${customCount} custom`
        : `${totalCount} emojis\n📌 all default`,
      inline: true,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎨 Emoji Configuration')
    .setDescription(
      `Manage custom emojis for this server. Click a category below to view and modify its emojis.`
    )
    .addFields(
      { name: '📊 Total Emojis', value: `${totalEmojis}`, inline: true },
      { name: '✨ Custom Overrides', value: `${customEmojis}`, inline: true },
      { name: '📌 Using Default', value: `${totalEmojis - customEmojis}`, inline: true },
      ...fields
    )
    .setFooter({ text: 'Select a category below to manage its emojis' })
    .setTimestamp();

  return embed;
}

function categoryIcon(category) {
  const icons = {
    status: '🟢',
    games: '🎮',
    currency: '💰',
    misc: '🔧',
    ranks: '🏆',
    moderation: '🛡️',
  };
  return icons[category.toLowerCase()] || '🔹';
}

export function buildCategoryPanel(category, categoryEmojis) {
  const entries = Object.entries(categoryEmojis);
  const customCount = entries.filter(([, e]) => e.isCustom).length;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${categoryIcon(category)} ${category.toUpperCase()} Emojis`)
    .setDescription(
      `Select an emoji from the dropdown below to modify it.\n\n` +
      `**${entries.length}** emoji${entries.length === 1 ? '' : 's'} in this category` +
      (customCount > 0 ? ` • **${customCount}** customized` : '')
    );

  const fields = entries.map(([key, emoji]) => {
    const status = emoji.isCustom ? '✨ Custom' : '📌 Default';
    const display = emoji.current?.display || emoji.default;
    return {
      name: `${display} ${emoji.label}`,
      value: `\`${key}\`\n${status}`,
      inline: true,
    };
  });

  embed.addFields(fields);
  embed.setFooter({ text: '⬅️ Back returns to the category overview' });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_${category}`)
    .setPlaceholder('Select an emoji to modify...')
    .addOptions(
      Object.entries(categoryEmojis).map(([key, emoji]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(emoji.label)
          .setValue(key)
          .setEmoji(emoji.current?.display || emoji.default)
          .setDescription(emoji.isCustom ? '✨ Custom emoji set' : '📌 Using default')
      )
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emoji_back').setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    selectRow: new ActionRowBuilder().addComponents(selectMenu),
    buttonRow: buttons,
  };
}

export function buildEmojiDetailsPanel(emojiKey, emojiData, serverEmojis) {
  const embed = new EmbedBuilder()
    .setColor(emojiData.isCustom ? 0xf47fff : 0x99aab5)
    .setTitle(`${emojiData.current?.display || emojiData.default}  Modify: ${emojiData.label}`)
    .setDescription(
      emojiData.isCustom
        ? `This emoji is currently **customized**. You can reset it to default or pick a different custom emoji below.`
        : `This emoji is currently using its **default** unicode version. Pick a custom emoji from a server below to override it.`
    );

  embed.addFields(
    { name: 'Current', value: `${emojiData.current?.display || emojiData.default}`, inline: true },
    { name: 'Default', value: `${emojiData.default}`, inline: true },
    { name: 'Status', value: emojiData.isCustom ? '✨ Custom' : '📌 Default', inline: true },
    { name: 'Key', value: `\`${emojiKey}\``, inline: true },
    { name: 'Category', value: `${categoryIcon(emojiData.category || 'misc')} ${emojiData.category || 'misc'}`, inline: true }
  );

  if (emojiData.current) {
    const sourceServer = serverEmojis.find((s) => s.id === emojiData.current.server);
    embed.addFields({
      name: 'Custom Emoji Source',
      value: `**${sourceServer ? sourceServer.name : 'Unknown server'}**\n\`${emojiData.current.name}\` (\`${emojiData.current.id}\`)`,
      inline: false,
    });
  }

  const serverOptions = serverEmojis.map((server) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${server.name} (${server.emojiCount} emojis)`)
      .setValue(`server_${server.id}`)
      .setDescription('Browse this server\'s custom emojis')
  );

  const serverSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_server_select_${emojiKey}`)
    .setPlaceholder('Choose a server for custom emojis...')
    .addOptions(
      serverOptions.length
        ? serverOptions
        : [new StringSelectMenuOptionBuilder().setLabel('No servers with emojis').setValue('none').setDescription('Invite the bot to a server with custom emojis')]
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoji_reset_${emojiKey}`)
      .setLabel('Reset to Default')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!emojiData.isCustom),
    new ButtonBuilder()
      .setCustomId(`emoji_back_category_${emojiData.category || 'status'}`)
      .setLabel('Back')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    serverSelectRow: new ActionRowBuilder().addComponents(serverSelect),
    buttonRow: buttons,
  };
}

const EMOJIS_PER_PAGE = 25;

export function buildServerEmojiPicker(emojiKey, serverName, serverEmojis, page = 0, serverId = null) {
  const totalPages = Math.max(1, Math.ceil(serverEmojis.length / EMOJIS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * EMOJIS_PER_PAGE;
  const pageEmojis = serverEmojis.slice(start, start + EMOJIS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`😀 Select Emoji from ${serverName}`)
    .setDescription(`Choose a custom emoji to use for \`${emojiKey}\`.`)
    .addFields({
      name: 'Showing',
      value: `${start + 1}–${start + pageEmojis.length} of **${serverEmojis.length}** emojis`,
      inline: true,
    })
    .setFooter({
      text: totalPages > 1
        ? `Page ${safePage + 1}/${totalPages} • Use Prev/Next to browse, or Search to jump by name`
        : 'Pick an emoji from the dropdown below',
    });

  const options = pageEmojis.map((emoji) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(emoji.name.slice(0, 100))
      .setValue(`emoji_${emoji.id}`)
      .setEmoji(emoji.unicode)
  );

  const emojiSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_from_server_${emojiKey}`)
    .setPlaceholder('Select custom emoji...')
    .addOptions(options);

  // Encode key/server/page in the customId so paging & search survive interaction round-trips.
  const navBase = `${emojiKey}::${serverId ?? ''}::${safePage}`;

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoji_page_prev_${navBase}`)
      .setLabel('Prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`emoji_page_next_${navBase}`)
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`emoji_search_${emojiKey}::${serverId ?? ''}`)
      .setLabel('Search')
      .setEmoji('🔎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('emoji_cancel_picker').setLabel('Cancel').setEmoji('✖️').setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    emojiSelectRow: new ActionRowBuilder().addComponents(emojiSelect),
    buttonRow: buttons,
  };
}

log('info', 'EmojiConfig', 'Emoji configuration command loaded');

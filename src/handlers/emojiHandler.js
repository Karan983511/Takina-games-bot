import { log } from '../booster/utils/logger.js';
import {
  buildCategoryPanel,
  buildEmojiDetailsPanel,
  buildServerEmojiPicker,
  buildMainPanel,
} from '../commands/emojiConfig.js';
import { getAllCategories } from '../utils/defaultEmojis.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from 'discord.js';

/**
 * Emoji Interaction Handler
 * Handles all button/select menu interactions for emoji configuration
 */
export async function handleEmojiInteraction(interaction) {
  const { customId, guildId } = interaction;
  const emojiManager = interaction.client.emojiManager;

  try {
    // ── Category selection ─────────────────────────────────────────────
    if (customId.startsWith('emoji_category_')) {
      const category = customId.replace('emoji_category_', '');
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const categoryEmojis = dashboardConfig[category];

      if (!categoryEmojis) {
        return interaction.reply({ content: '❌ Category not found', ephemeral: true });
      }

      const panel = buildCategoryPanel(category, categoryEmojis);
      return interaction.update({
        embeds: [panel.embed],
        components: [panel.selectRow, panel.buttonRow],
      });
    }

    // ── Emoji selection from category dropdown ─────────────────────────
    if (customId.startsWith('emoji_select_') && !customId.startsWith('emoji_select_from_server_')) {
      const category = customId.replace('emoji_select_', '');
      const selectedEmojiKey = interaction.values[0];
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const emojiData = dashboardConfig[category]?.[selectedEmojiKey];

      if (!emojiData) {
        return interaction.reply({ content: '❌ Emoji not found', ephemeral: true });
      }

      emojiData.category = category;

      const serverEmojis = emojiManager.getAccessibleServers();
      const panel = buildEmojiDetailsPanel(selectedEmojiKey, emojiData, serverEmojis);

      return interaction.update({
        embeds: [panel.embed],
        components: [panel.serverSelectRow, panel.buttonRow],
      });
    }

    // ── Server selection for emoji picker ──────────────────────────────
    if (customId.startsWith('emoji_server_select_')) {
      const emojiKey = customId.replace('emoji_server_select_', '');
      const selectedValue = interaction.values[0];
      if (selectedValue === 'none') {
        return interaction.reply({ content: '❌ No servers with custom emojis available.', ephemeral: true });
      }

      const selectedServerId = selectedValue.replace('server_', '');
      const selectedServer = emojiManager.getAccessibleServers().find((s) => s.id === selectedServerId);

      if (!selectedServer) {
        return interaction.reply({ content: '❌ Server not found', ephemeral: true });
      }

      const serverEmojis = emojiManager.getServerEmojis(selectedServerId);
      if (serverEmojis.length === 0) {
        return interaction.reply({
          content: `❌ ${selectedServer.name} has no custom emojis`,
          ephemeral: true,
        });
      }

      const panel = buildServerEmojiPicker(emojiKey, selectedServer.name, serverEmojis, 0, selectedServerId);
      return interaction.update({
        embeds: [panel.embed],
        components: [panel.emojiSelectRow, panel.buttonRow],
      });
    }

    // ── Page prev/next through a server's emoji list ────────────────────
    if (customId.startsWith('emoji_page_prev_') || customId.startsWith('emoji_page_next_')) {
      const direction = customId.startsWith('emoji_page_prev_') ? -1 : 1;
      const prefix = direction === -1 ? 'emoji_page_prev_' : 'emoji_page_next_';
      const [emojiKey, serverId, pageStr] = customId.replace(prefix, '').split('::');

      const server = emojiManager.getAccessibleServers().find((s) => s.id === serverId);
      if (!server) {
        return interaction.reply({ content: '❌ Server not found', ephemeral: true });
      }

      const serverEmojis = emojiManager.getServerEmojis(serverId);
      const nextPage = parseInt(pageStr, 10) + direction;

      const panel = buildServerEmojiPicker(emojiKey, server.name, serverEmojis, nextPage, serverId);
      return interaction.update({
        embeds: [panel.embed],
        components: [panel.emojiSelectRow, panel.buttonRow],
      });
    }

    // ── Open search modal ────────────────────────────────────────────────
    if (customId.startsWith('emoji_search_')) {
      const [emojiKey, serverId] = customId.replace('emoji_search_', '').split('::');

      const modal = new ModalBuilder()
        .setCustomId(`emoji_searchmodal_${emojiKey}::${serverId}`)
        .setTitle('Search emoji by name')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji_search_query')
              .setLabel('Emoji name (or part of it)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(100)
          )
        );

      return interaction.showModal(modal);
    }

    // ── Search modal submitted ───────────────────────────────────────────
    if (customId.startsWith('emoji_searchmodal_')) {
      const [emojiKey, serverId] = customId.replace('emoji_searchmodal_', '').split('::');
      const query = interaction.fields.getTextInputValue('emoji_search_query').trim().toLowerCase();

      const server = emojiManager.getAccessibleServers().find((s) => s.id === serverId);
      if (!server) {
        return interaction.reply({ content: '❌ Server not found', ephemeral: true });
      }

      const allEmojis = emojiManager.getServerEmojis(serverId);
      const matches = allEmojis.filter((e) => e.name.toLowerCase().includes(query));

      if (matches.length === 0) {
        return interaction.reply({
          content: `❌ No emojis matching **${query}** found in ${server.name}.`,
          ephemeral: true,
        });
      }

      const panel = buildServerEmojiPicker(emojiKey, `${server.name} (search: "${query}")`, matches, 0, serverId);
      return interaction.reply({
        embeds: [panel.embed],
        components: [panel.emojiSelectRow, panel.buttonRow],
        ephemeral: true,
      });
    }

    // ── Emoji selection from server ────────────────────────────────────
    if (customId.startsWith('emoji_select_from_server_')) {
      const emojiKey = customId.replace('emoji_select_from_server_', '');
      const selectedEmojiId = interaction.values[0].replace('emoji_', '');

      const servers = emojiManager.getAccessibleServers();
      let selectedEmoji = null;
      let sourceServerId = null;

      for (const server of servers) {
        const emojis = emojiManager.getServerEmojis(server.id);
        const found = emojis.find((e) => e.id === selectedEmojiId);
        if (found) {
          selectedEmoji = found;
          sourceServerId = server.id;
          break;
        }
      }

      if (!selectedEmoji || !sourceServerId) {
        return interaction.reply({
          content: '❌ Emoji not found or not accessible',
          ephemeral: true,
        });
      }

      if (!emojiManager.validateCustomEmoji(selectedEmojiId, sourceServerId)) {
        return interaction.reply({
          content: '❌ This emoji is no longer accessible',
          ephemeral: true,
        });
      }

      await emojiManager.setCustomEmoji(
        guildId,
        emojiKey,
        selectedEmojiId,
        selectedEmoji.name,
        sourceServerId,
        interaction.user.id,
        selectedEmoji.animated
      );

      return interaction.update({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`✅ **${emojiKey}** is now set to ${selectedEmoji.unicode} \`${selectedEmoji.name}\``)
            .setFooter({ text: 'The change is live immediately' }),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('emoji_back')
              .setLabel('Back to Categories')
              .setEmoji('⬅️')
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });
    }

    // ── Reset emoji to default ─────────────────────────────────────────
    if (customId.startsWith('emoji_reset_')) {
      const emojiKey = customId.replace('emoji_reset_', '');
      await emojiManager.removeCustomEmoji(guildId, emojiKey);

      return interaction.update({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`✅ **${emojiKey}** has been reset to its default emoji.`),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('emoji_back')
              .setLabel('Back to Categories')
              .setEmoji('⬅️')
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });
    }

    // ── Back to main menu ────────────────────────────────────────────
    if (customId === 'emoji_back') {
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const categories = getAllCategories();

      const categoryButtons = buildCategoryRows(categories);
      const embed = buildMainPanel(dashboardConfig, categories);

      return interaction.update({
        embeds: [embed],
        components: categoryButtons,
      });
    }

    // ── Back to category ───────────────────────────────────────────────
    if (customId.startsWith('emoji_back_category_')) {
      const category = customId.replace('emoji_back_category_', '');
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const categoryEmojis = dashboardConfig[category];

      if (!categoryEmojis) {
        return interaction.reply({ content: '❌ Category not found', ephemeral: true });
      }

      const panel = buildCategoryPanel(category, categoryEmojis);
      return interaction.update({
        embeds: [panel.embed],
        components: [panel.selectRow, panel.buttonRow],
      });
    }

    // ── Cancel picker ──────────────────────────────────────────────────
    if (customId === 'emoji_cancel_picker') {
      return interaction.update({
        content: '❌ Cancelled emoji selection',
        embeds: [],
        components: [],
      });
    }
  } catch (err) {
    log('error', 'EmojiHandler', `Error handling emoji interaction: ${err.message}`);
    return interaction
      .reply({
        content: '❌ An error occurred while processing your request',
        ephemeral: true,
      })
      .catch(() => {});
  }
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

log('info', 'EmojiHandler', 'Emoji interaction handler loaded');

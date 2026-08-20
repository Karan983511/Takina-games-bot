import EmojiConfig from '../booster/models/EmojiConfig.js';
import { log } from '../booster/utils/logger.js';
import {
  buildCategoryPanel,
  buildEmojiDetailsPanel,
  buildServerEmojiPicker,
} from '../commands/emojiConfig.js';
import { getAllCategories, getEmojisByCategory } from '../utils/defaultEmojis.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Emoji Interaction Handler
 * Handles all button/select menu interactions for emoji configuration
 */
export async function handleEmojiInteraction(interaction) {
  const { customId, guildId } = interaction;
  const emojiManager = interaction.client.emojiManager;

  try {
    // Category selection
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

    // Emoji selection from category
    if (customId.startsWith('emoji_select_')) {
      const category = customId.replace('emoji_select_', '');
      const selectedEmojiKey = interaction.values[0];
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const emojiData = dashboardConfig[category][selectedEmojiKey];

      if (!emojiData) {
        return interaction.reply({ content: '❌ Emoji not found', ephemeral: true });
      }

      const serverEmojis = emojiManager.getAccessibleServers();
      const panel = buildEmojiDetailsPanel(selectedEmojiKey, emojiData, serverEmojis);

      return interaction.update({
        embeds: [panel.embed],
        components: [panel.serverSelectRow, panel.buttonRow],
      });
    }

    // Server selection for emoji picker
    if (customId.startsWith('emoji_server_select_')) {
      const emojiKey = customId.replace('emoji_server_select_', '');
      const selectedServerId = interaction.values[0].replace('server_', '');

      const selectedServer = emojiManager.getAccessibleServers().find(s => s.id === selectedServerId);
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

      const panel = buildServerEmojiPicker(emojiKey, selectedServer.name, serverEmojis);
      return interaction.update({
        embeds: [panel.embed],
        components: [panel.emojiSelectRow, panel.buttonRow],
      });
    }

    // Emoji selection from server
    if (customId.startsWith('emoji_select_from_server_')) {
      const emojiKey = customId.replace('emoji_select_from_server_', '');
      const selectedEmojiId = interaction.values[0].replace('emoji_', '');

      // Find the emoji in all accessible servers
      const servers = emojiManager.getAccessibleServers();
      let selectedEmoji = null;
      let sourceServerId = null;

      for (const server of servers) {
        const emojis = emojiManager.getServerEmojis(server.id);
        const found = emojis.find(e => e.id === selectedEmojiId);
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

      // Validate emoji is accessible
      if (!emojiManager.validateCustomEmoji(selectedEmojiId, sourceServerId)) {
        return interaction.reply({
          content: '❌ This emoji is no longer accessible',
          ephemeral: true,
        });
      }

      // Set the custom emoji
      await emojiManager.setCustomEmoji(
        guildId,
        emojiKey,
        selectedEmojiId,
        selectedEmoji.name,
        sourceServerId,
        interaction.user.id
      );

      return interaction.reply({
        content: `✅ Successfully set **${emojiKey}** to ${selectedEmoji.unicode}`,
        ephemeral: true,
      });
    }

    // Reset emoji to default
    if (customId.startsWith('emoji_reset_')) {
      const emojiKey = customId.replace('emoji_reset_', '');

      await emojiManager.removeCustomEmoji(guildId, emojiKey);

      return interaction.reply({
        content: `✅ Reset **${emojiKey}** to default emoji`,
        ephemeral: true,
      });
    }

    // Back buttons
    if (customId === 'emoji_back') {
      const dashboardConfig = await emojiManager.getConfigForDashboard(guildId);
      const categories = getAllCategories();

      const categoryButtons = new ActionRowBuilder().addComponents(
        ...categories.map((cat, idx) =>
          new ButtonBuilder()
            .setCustomId(`emoji_category_${cat}`)
            .setLabel(cat.toUpperCase())
            .setStyle(ButtonStyle.Primary)
            .setDisabled(idx > 4)
        )
      );

      const { buildMainPanel } = await import('../commands/emojiConfig.js');
      const embed = buildMainPanel(dashboardConfig, categories);

      return interaction.update({
        embeds: [embed],
        components: [categoryButtons],
      });
    }

    if (customId === 'emoji_back_category') {
      return interaction.reply({
        content: 'Please use `/emoji-config` again to return to the main menu',
        ephemeral: true,
      });
    }

    if (customId === 'emoji_cancel_picker') {
      return interaction.reply({
        content: '❌ Cancelled emoji selection',
        ephemeral: true,
      });
    }
  } catch (err) {
    log('error', 'EmojiHandler', `Error handling emoji interaction: ${err.message}`);
    return interaction.reply({
      content: '❌ An error occurred while processing your request',
      ephemeral: true,
    }).catch(() => {});
  }
}

log('info', 'EmojiHandler', 'Emoji interaction handler loaded');

import emojiService from './emojiService.js';
import { DEFAULT_EMOJIS, getAllCategories, getEmojisByCategory } from '../utils/defaultEmojis.js';
import { log } from '../booster/utils/logger.js';

/**
 * EmojiManager - Core emoji management logic
 * Handles retrieving emojis, managing replacements, and propagating changes
 */
export class EmojiManager {
  constructor(client) {
    this.client = client;
    this.emojiService = emojiService;
  }

  /**
   * Initialize emoji manager for all cached guilds
   */
  async initialize() {
    try {
      const guilds = this.client.guilds.cache;
      for (const [guildId] of guilds) {
        await this.emojiService.syncWithDefaults(guildId);
      }
      log('info', 'EmojiManager', `Initialized emoji manager for ${guilds.size} guild(s)`);
    } catch (err) {
      log('error', 'EmojiManager', `Failed to initialize: ${err.message}`);
    }
  }

  /**
   * Get emoji display string for use in messages.
   * Automatically uses custom if set, otherwise default.
   */
  async getEmoji(guildId, emojiKey) {
    try {
      return await this.emojiService.getEmojiDisplay(guildId, emojiKey);
    } catch (err) {
      log('error', 'EmojiManager', `Failed to get emoji ${emojiKey}: ${err.message}`);
      return DEFAULT_EMOJIS[emojiKey]?.unicode || '❓';
    }
  }

  /**
   * Get multiple emojis at once
   */
  async getEmojis(guildId, ...emojiKeys) {
    const result = {};
    await Promise.all(
      emojiKeys.map(async (key) => {
        result[key] = await this.getEmoji(guildId, key);
      })
    );
    return result;
  }

  /**
   * Get full emoji configuration grouped by category for dashboard/display
   */
  async getConfigForDashboard(guildId) {
    try {
      const config = await this.emojiService.getGuildEmojiConfig(guildId);
      const categories = getAllCategories();

      const grouped = {};
      for (const category of categories) {
        grouped[category] = {};
        const emojisInCat = getEmojisByCategory(category);

        for (const [key, emojiData] of Object.entries(emojisInCat)) {
          const custom = config[key];
          grouped[category][key] = {
            label: emojiData.label,
            default: emojiData.unicode,
            current: custom?.isCustom
              ? {
                  id: custom.customId,
                  name: custom.customName,
                  server: custom.sourceServerId,
                  display: custom.animated
                    ? `<a:${custom.customName}:${custom.customId}>`
                    : `<:${custom.customName}:${custom.customId}>`,
                  animated: custom.animated,
                }
              : null,
            isCustom: custom?.isCustom || false,
          };
        }
      }

      return grouped;
    } catch (err) {
      log('error', 'EmojiManager', `Failed to get dashboard config: ${err.message}`);
      return {};
    }
  }

  /**
   * Set custom emoji for a guild
   */
  async setCustomEmoji(guildId, emojiKey, customId, customName, sourceServerId, userId, animated = false) {
    try {
      await this.emojiService.setCustomEmoji(
        guildId,
        emojiKey,
        { customId, customName, sourceServerId, animated },
        userId
      );

      log('info', 'EmojiManager', `User ${userId} changed emoji ${emojiKey} in guild ${guildId}`);
      return true;
    } catch (err) {
      log('error', 'EmojiManager', `Failed to set custom emoji: ${err.message}`);
      throw err;
    }
  }

  /**
   * Remove custom emoji override
   */
  async removeCustomEmoji(guildId, emojiKey) {
    try {
      await this.emojiService.removeCustomEmoji(guildId, emojiKey);
      log('info', 'EmojiManager', `Removed custom emoji ${emojiKey} from guild ${guildId}`);
      return true;
    } catch (err) {
      log('error', 'EmojiManager', `Failed to remove custom emoji: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all custom emojis available from a specific server
   */
  getServerEmojis(serverId) {
    const server = this.client.guilds.cache.get(serverId);
    if (!server) return [];

    return server.emojis.cache.map((emoji) => ({
      id: emoji.id,
      name: emoji.name,
      unicode: emoji.toString(),
      animated: emoji.animated,
    }));
  }

  /**
   * Get all servers the bot has access to that have custom emojis
   */
  getAccessibleServers() {
    return Array.from(this.client.guilds.cache.values())
      .filter((guild) => guild.emojis.cache.size > 0)
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        emojiCount: guild.emojis.cache.size,
      }));
  }

  /**
   * Validate that a custom emoji is still accessible
   */
  validateCustomEmoji(customId, serverId) {
    const server = this.client.guilds.cache.get(serverId);
    if (!server) return false;
    return server.emojis.cache.has(customId);
  }
}

export default EmojiManager;

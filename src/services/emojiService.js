import EmojiConfig from '../booster/models/EmojiConfig.js';
import { DEFAULT_EMOJIS, getAllEmojiKeys } from '../utils/defaultEmojis.js';
import { log } from '../booster/utils/logger.js';

/**
 * EmojiService - Database & Persistence Layer
 * Handles all database operations for emoji configuration
 */
export class EmojiService {
  constructor() {
    this._cache = new Map(); // guildId → emoji configuration
    this._updateTimers = new Map(); // guildId → debounce timer
    this.PERSIST_DEBOUNCE_MS = 1000;
  }

  /**
   * Get emoji configuration for a guild
   * Returns both default emojis and custom overrides
   */
  async getGuildEmojiConfig(guildId) {
    if (this._cache.has(guildId)) {
      return this._cache.get(guildId);
    }

    let config = await EmojiConfig.findOne({ guildId }).lean();
    if (!config) {
      config = await this._createDefaultConfig(guildId);
    }

    const merged = this._mergeConfigWithDefaults(config);
    this._cache.set(guildId, merged);
    return merged;
  }

  /**
   * Get a specific emoji by key for a guild
   * Returns custom emoji if set, otherwise default
   */
  async getEmoji(guildId, emojiKey) {
    const config = await this.getGuildEmojiConfig(guildId);
    return config[emojiKey] || DEFAULT_EMOJIS[emojiKey];
  }

  /**
   * Get emoji display value (ID if custom, unicode if default)
   */
  async getEmojiDisplay(guildId, emojiKey) {
    const emoji = await this.getEmoji(guildId, emojiKey);
    if (!emoji) return null;
    
    // If it's a custom emoji, return the Discord emoji format
    if (emoji.customId) {
      return `<:${emoji.customName}:${emoji.customId}>`;
    }
    
    // Otherwise return unicode
    return emoji.unicode;
  }

  /**
   * Set custom emoji for a guild
   * emojiOverride: { customId, customName, sourceServerId }
   */
  async setCustomEmoji(guildId, emojiKey, emojiOverride, userId) {
    if (!DEFAULT_EMOJIS[emojiKey]) {
      throw new Error(`Emoji key "${emojiKey}" not found in defaults`);
    }

    let config = await EmojiConfig.findOne({ guildId });
    if (!config) {
      config = await this._createDefaultConfig(guildId);
    }

    // Update custom emojis map
    if (!config.customEmojis) config.customEmojis = new Map();
    
    config.customEmojis.set(emojiKey, {
      emojiKey,
      customId: emojiOverride.customId,
      customName: emojiOverride.customName,
      sourceServerId: emojiOverride.sourceServerId,
      addedAt: new Date(),
      addedBy: userId,
    });

    config.lastSyncAt = new Date();
    await config.save();
    
    // Update cache
    this._cache.delete(guildId);
    await this.getGuildEmojiConfig(guildId);
    
    log('info', 'EmojiService', `Updated custom emoji ${emojiKey} for guild ${guildId}`);
  }

  /**
   * Remove custom emoji override and revert to default
   */
  async removeCustomEmoji(guildId, emojiKey) {
    const config = await EmojiConfig.findOne({ guildId });
    if (!config) return;

    if (config.customEmojis && config.customEmojis.has(emojiKey)) {
      config.customEmojis.delete(emojiKey);
      config.lastSyncAt = new Date();
      await config.save();
      
      // Update cache
      this._cache.delete(guildId);
      await this.getGuildEmojiConfig(guildId);
      
      log('info', 'EmojiService', `Removed custom emoji ${emojiKey} for guild ${guildId}`);
    }
  }

  /**
   * Disable an emoji so it doesn't appear in the config UI
   */
  async disableEmoji(guildId, emojiKey) {
    const config = await EmojiConfig.findOne({ guildId });
    if (!config) return;

    if (!config.disabledKeys.includes(emojiKey)) {
      config.disabledKeys.push(emojiKey);
      await config.save();
      this._cache.delete(guildId);
    }
  }

  /**
   * Enable a disabled emoji
   */
  async enableEmoji(guildId, emojiKey) {
    const config = await EmojiConfig.findOne({ guildId });
    if (!config) return;

    config.disabledKeys = config.disabledKeys.filter(k => k !== emojiKey);
    await config.save();
    this._cache.delete(guildId);
  }

  /**
   * Get all available emoji keys for a guild (excluding disabled ones)
   */
  async getAvailableEmojiKeys(guildId) {
    const config = await EmojiConfig.findOne({ guildId });
    const disabledKeys = config?.disabledKeys || [];
    
    return getAllEmojiKeys().filter(key => !disabledKeys.includes(key));
  }

  /**
   * Sync emoji configuration with defaults
   * Adds any new emojis that were added to DEFAULT_EMOJIS
   */
  async syncWithDefaults(guildId) {
    let config = await EmojiConfig.findOne({ guildId });
    if (!config) {
      config = await this._createDefaultConfig(guildId);
    }

    const defaultKeys = getAllEmojiKeys();
    let updated = false;

    for (const key of defaultKeys) {
      // Config document doesn't track "all emojis", just overrides
      // Sync is implicit when reading, but we can log new ones
    }

    config.lastSyncAt = new Date();
    await config.save();
    this._cache.delete(guildId);
    
    log('info', 'EmojiService', `Synced emoji config for guild ${guildId}`);
  }

  /**
   * Get all custom emoji overrides for a guild
   */
  async getAllCustomEmojis(guildId) {
    const config = await EmojiConfig.findOne({ guildId });
    if (!config || !config.customEmojis) return new Map();
    return config.customEmojis;
  }

  /**
   * Private: Create default emoji configuration for a guild
   */
  async _createDefaultConfig(guildId) {
    const config = new EmojiConfig({
      guildId,
      customEmojis: new Map(),
      disabledKeys: [],
    });
    await config.save();
    return config;
  }

  /**
   * Private: Merge custom overrides with defaults
   */
  _mergeConfigWithDefaults(config) {
    const merged = { ...DEFAULT_EMOJIS };

    if (config.customEmojis && config.customEmojis.size > 0) {
      for (const [key, custom] of config.customEmojis) {
        merged[key] = {
          ...DEFAULT_EMOJIS[key],
          ...custom,
          isCustom: true,
        };
      }
    }

    return merged;
  }

  /**
   * Clear cache for a guild (call after updates)
   */
  clearCache(guildId) {
    this._cache.delete(guildId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this._cache.clear();
  }
}

export default new EmojiService();

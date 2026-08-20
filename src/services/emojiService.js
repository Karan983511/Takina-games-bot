import EmojiConfig from '../booster/models/EmojiConfig.js';
import { DEFAULT_EMOJIS, getAllEmojiKeys } from '../utils/defaultEmojis.js';
import { log } from '../booster/utils/logger.js';

/**
 * EmojiService - Database & Persistence Layer
 * Handles all database operations for emoji configuration
 */
export class EmojiService {
  constructor() {
    this._cache = new Map(); // guildId → merged emoji configuration
  }

  /**
   * Get merged emoji configuration for a guild (defaults + custom overrides)
   * FIX: Removed .lean() because it converts Maps to plain objects,
   * which breaks customEmojis iteration.
   */
  async getGuildEmojiConfig(guildId) {
    if (this._cache.has(guildId)) {
      return this._cache.get(guildId);
    }

    // Keep the first read/create atomic so concurrent startup and command requests
    // cannot create duplicate configs for the same guild.
    const config = await EmojiConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId, customEmojis: new Map(), disabledKeys: [] } },
      { upsert: true, new: true }
    );

    const merged = this._mergeConfigWithDefaults(config);
    this._cache.set(guildId, merged);
    return merged;
  }

  /**
   * Get a specific emoji by key for a guild
   */
  async getEmoji(guildId, emojiKey) {
    const config = await this.getGuildEmojiConfig(guildId);
    return config[emojiKey] || DEFAULT_EMOJIS[emojiKey];
  }

  /**
   * Get emoji display value (Discord format if custom, unicode if default)
   */
  async getEmojiDisplay(guildId, emojiKey) {
    const emoji = await this.getEmoji(guildId, emojiKey);
    if (!emoji) return null;

    if (emoji.customId) {
      return emoji.animated
        ? `<a:${emoji.customName}:${emoji.customId}>`
        : `<:${emoji.customName}:${emoji.customId}>`;
    }
    return emoji.unicode;
  }

  /**
   * Set custom emoji for a guild
   * FIX: Use findOneAndUpdate with upsert to prevent race conditions
   * when two commands run simultaneously for a new guild.
   */
  async setCustomEmoji(guildId, emojiKey, emojiOverride, userId) {
    if (!DEFAULT_EMOJIS[emojiKey]) {
      throw new Error(`Emoji key "${emojiKey}" not found in defaults`);
    }

    // FIX: Atomic upsert to prevent duplicate key errors
    const config = await EmojiConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId, customEmojis: new Map(), disabledKeys: [] } },
      { upsert: true, new: true }
    );

    if (!config.customEmojis) config.customEmojis = new Map();

    config.customEmojis.set(emojiKey, {
      emojiKey,
      customId: emojiOverride.customId,
      customName: emojiOverride.customName,
      sourceServerId: emojiOverride.sourceServerId,
      animated: emojiOverride.animated || false,
      addedAt: new Date(),
      addedBy: userId,
    });

    config.lastSyncAt = new Date();
    await config.save();

    this._cache.delete(guildId);

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

      this._cache.delete(guildId);

      log('info', 'EmojiService', `Removed custom emoji ${emojiKey} for guild ${guildId}`);
    }
  }

  /**
   * Sync emoji configuration with defaults.
   * Ensures new DEFAULT_EMOJIS keys are recognized for a guild.
   */
  async syncWithDefaults(guildId) {
    const config = await EmojiConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId, customEmojis: new Map(), disabledKeys: [] } },
      { upsert: true, new: true }
    );

    config.lastSyncAt = new Date();
    await config.save();
    this._cache.delete(guildId);

    log('info', 'EmojiService', `Synced emoji config for guild ${guildId}`);
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
   * FIX: Handle both Mongoose Maps and plain objects (defensive)
   */
  _mergeConfigWithDefaults(config) {
    const merged = {};

    for (const [key, def] of Object.entries(DEFAULT_EMOJIS)) {
      merged[key] = { ...def, isCustom: false };
    }

    // Defensive: handle both Map and plain object
    let customMap = config.customEmojis;
    if (!(customMap instanceof Map) && customMap) {
      customMap = new Map(Object.entries(customMap));
    }

    if (customMap && customMap.size > 0) {
      for (const [key, custom] of customMap) {
        if (merged[key]) {
          merged[key] = {
            ...merged[key],
            ...custom,
            isCustom: true,
          };
        }
      }
    }

    return merged;
  }

  clearCache(guildId) {
    this._cache.delete(guildId);
  }

  clearAllCaches() {
    this._cache.clear();
  }
}

export default new EmojiService();

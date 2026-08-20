import mongoose from 'mongoose';

/**
 * EmojiConfig Schema
 * Stores custom emoji configurations for each guild
 * Allows replacing default emojis with custom ones from other servers
 */
const EmojiConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true },
    
    // Custom emoji overrides: { emojiKey: { customId, customName, sourceServerId } }
    customEmojis: {
      type: Map,
      of: new mongoose.Schema({
        emojiKey: String,           // Reference to DEFAULT_EMOJIS key
        customId: String,           // Discord emoji ID (for custom emojis)
        customName: String,         // Custom emoji name
        sourceServerId: String,     // Which server this emoji is from
        addedAt: { type: Date, default: Date.now },
        addedBy: String,            // User ID who added it
      }, { _id: false }),
      default: new Map(),
    },

    // Disabled emojis (not shown in config)
    disabledKeys: { type: [String], default: [] },

    // Last sync timestamp
    lastSyncAt: { type: Date, default: Date.now },

    // Whether emoji changes auto-propagate
    autoPropagateChanges: { type: Boolean, default: true },
  },
  { timestamps: true }
);

EmojiConfigSchema.index({ guildId: 1 });

export default mongoose.model('EmojiConfig', EmojiConfigSchema);

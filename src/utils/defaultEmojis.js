/**
 * Default Emoji Registry
 * Central registry of all emojis used throughout the bot.
 * Each emoji has a unique key, default unicode/emoji, and a human-readable label.
 *
 * DEVELOPER GUIDE:
 * To add a new emoji, use registerEmoji() in your module init,
 * or add it directly to DEFAULT_EMOJIS below.
 * New emojis automatically appear in the /emoji-config dashboard.
 */

export const DEFAULT_EMOJIS = {
  // Status Emojis
  success: { unicode: '✅', label: 'Success', category: 'status' },
  error: { unicode: '❌', label: 'Error', category: 'status' },
  warning: { unicode: '⚠️', label: 'Warning', category: 'status' },
  loading: { unicode: '⏳', label: 'Loading', category: 'status' },
  info: { unicode: 'ℹ️', label: 'Info', category: 'status' },

  // Currency & Economy
  currency: { unicode: '💰', label: 'Currency', category: 'economy' },
  coin: { unicode: '🪙', label: 'Coin', category: 'economy' },
  gem: { unicode: '💎', label: 'Gem', category: 'economy' },

  // Game Emojis
  gamepad: { unicode: '🎮', label: 'Game', category: 'games' },
  trophy: { unicode: '🏆', label: 'Trophy', category: 'games' },
  star: { unicode: '⭐', label: 'Star', category: 'games' },
  crown: { unicode: '👑', label: 'Crown', category: 'games' },

  // User Actions
  upvote: { unicode: '👍', label: 'Upvote', category: 'actions' },
  downvote: { unicode: '👎', label: 'Downvote', category: 'actions' },
  delete: { unicode: '🗑️', label: 'Delete', category: 'actions' },
  edit: { unicode: '✏️', label: 'Edit', category: 'actions' },
  close: { unicode: '❌', label: 'Close', category: 'actions' },

  // Roles & Permissions
  role: { unicode: '🎭', label: 'Role', category: 'roles' },
  boost: { unicode: '✨', label: 'Boost', category: 'roles' },
  featured: { unicode: '🌟', label: 'Featured', category: 'roles' },

  // Communication
  bell: { unicode: '🔔', label: 'Bell', category: 'communication' },
  mail: { unicode: '📧', label: 'Mail', category: 'communication' },
  chat: { unicode: '💬', label: 'Chat', category: 'communication' },

  // Navigation
  back: { unicode: '⬅️', label: 'Back', category: 'navigation' },
  next: { unicode: '➡️', label: 'Next', category: 'navigation' },
  home: { unicode: '🏠', label: 'Home', category: 'navigation' },
};

/**
 * Register a new emoji at runtime.
 * Call this during module initialization to add new emojis dynamically.
 * They will automatically appear in the Emoji Management dashboard.
 *
 * Example:
 *   registerEmoji('fire', '🔥', 'Fire', 'status');
 */
export function registerEmoji(key, unicode, label, category = 'misc') {
  if (DEFAULT_EMOJIS[key]) {
    console.warn(`[EmojiRegistry] Overwriting existing emoji key: ${key}`);
  }
  DEFAULT_EMOJIS[key] = { unicode, label, category };
}

/**
 * Get emoji by key
 */
export function getEmojiByKey(key) {
  return DEFAULT_EMOJIS[key] || null;
}

/**
 * Get all emoji keys
 */
export function getAllEmojiKeys() {
  return Object.keys(DEFAULT_EMOJIS);
}

/**
 * Get emojis by category
 */
export function getEmojisByCategory(category) {
  return Object.entries(DEFAULT_EMOJIS)
    .filter(([, data]) => data.category === category)
    .reduce((acc, [key, data]) => {
      acc[key] = data;
      return acc;
    }, {});
}

/**
 * Get all unique categories
 */
export function getAllCategories() {
  return [...new Set(Object.values(DEFAULT_EMOJIS).map(e => e.category))];
}

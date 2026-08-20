import { Events } from 'discord.js';

export default {
  name: Events.GuildCreate,
  async execute(guild, client) {
    console.log(`[GuildCreate] Joined guild: ${guild.name} (${guild.id})`);
    // Initialize config (creates default) and start scheduler
    client.config.get(guild.id);
    client.scheduler.startGuild(guild.id);

    // Make sure this guild's emoji cache is populated and its emoji config
    // exists, so it shows up in the emoji picker right away.
    try {
      await guild.emojis.fetch();
      if (client.emojiManager) {
        await client.emojiManager.emojiService.syncWithDefaults(guild.id);
      }
      console.log(`[GuildCreate] Synced ${guild.emojis.cache.size} emoji(s) for ${guild.name}`);
    } catch (err) {
      console.error(`[GuildCreate] Failed to sync emojis for ${guild.name}: ${err.message}`);
    }
  },
};

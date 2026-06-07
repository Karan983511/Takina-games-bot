import { Events } from 'discord.js';

export default {
  name: Events.GuildCreate,
  async execute(guild, client) {
    console.log(`[GuildCreate] Joined guild: ${guild.name} (${guild.id})`);
    // Initialize config (creates default) and start scheduler
    client.config.get(guild.id);
    client.scheduler.startGuild(guild.id);
  },
};

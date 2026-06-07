import { Events } from 'discord.js';

export default {
  name: Events.GuildDelete,
  async execute(guild, client) {
    console.log(`[GuildDelete] Left guild: ${guild.name} (${guild.id})`);
    client.scheduler.stopGuild(guild.id);
  },
};

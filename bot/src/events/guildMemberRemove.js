import { Events } from 'discord.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      const { handleMemberLeave } = await import('../booster/index.js');
      await handleMemberLeave(member);
    } catch (err) {
      console.error('[guildMemberRemove] Error:', err);
    }
  },
};

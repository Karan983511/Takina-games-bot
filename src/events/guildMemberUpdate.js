import { Events } from 'discord.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      const { handleBoostChange } = await import('../booster/index.js');
      await handleBoostChange(oldMember, newMember, newMember.client);
    } catch (err) {
      console.error('[guildMemberUpdate] Booster handler error:', err);
    }
  },
};

import { Events } from 'discord.js';
import { log } from '../booster/utils/logger.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    try {
      const { handleMemberLeave } = await import('../booster/index.js');
      await handleMemberLeave({
        guild: ban.guild,
        id: ban.user.id,
        user: ban.user,
      }, { source: 'ban' });
    } catch (err) {
      log('error', 'GuildBanAdd', err.message);
    }
  },
};

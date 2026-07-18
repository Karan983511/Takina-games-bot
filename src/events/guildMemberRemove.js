import { Events } from 'discord.js';
import { log } from '../booster/utils/logger.js';
import BoosterRole from '../booster/models/BoosterRole.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    // 1. Handle the leaving member's own booster role
    try {
      const { handleMemberLeave } = await import('../booster/index.js');
      await handleMemberLeave(member);
    } catch (err) {
      log('error', 'GuildMemberRemove', err.message);
    }

    // 2. Remove the leaving member from anyone else's sharedWith (and hiddenBy) list
    try {
      const result = await BoosterRole.updateMany(
        { guildId: member.guild.id, sharedWith: member.id },
        { $pull: { sharedWith: member.id, hiddenBy: member.id } },
      );
      if (result.modifiedCount > 0) {
        log('info', 'GuildMemberRemove', `Pruned ${member.id} from ${result.modifiedCount} sharedWith list(s)`);
      }
    } catch (err) {
      log('error', 'GuildMemberRemove', `sharedWith prune error: ${err.message}`);
    }
  },
};

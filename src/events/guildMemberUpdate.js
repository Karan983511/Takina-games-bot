import { Events } from 'discord.js';
import BoosterSettings from '../booster/models/BoosterSettings.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      const { handleBoostChange, handleEligibilityLost } = await import('../booster/index.js');

      await handleBoostChange(oldMember, newMember, newMember.client);

      const settings = await BoosterSettings.findOne({ guildId: newMember.guild.id }).lean();
      if (settings?.eligibilityRoleId) {
        const hadRole = oldMember.roles.cache.has(settings.eligibilityRoleId);
        const hasRole = newMember.roles.cache.has(settings.eligibilityRoleId);
        if (hadRole && !hasRole) {
          await handleEligibilityLost(newMember);
        }
      }
    } catch (err) {
      console.error('[guildMemberUpdate] Error:', err);
    }
  },
};

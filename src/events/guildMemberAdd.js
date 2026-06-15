import { Events } from 'discord.js';
import { log } from '../booster/utils/logger.js';
import BoosterSettings from '../booster/models/BoosterSettings.js';
import BoosterRole from '../booster/models/BoosterRole.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      const settings = await BoosterSettings.findOne({ guildId: member.guild.id }).lean();
      if (!settings?.features?.customRoles) return;
      if (!member.premiumSince) return;

      const doc = await BoosterRole.findOne({ guildId: member.guild.id, userId: member.id, active: false });
      if (!doc) return;

      const { restoreRole } = await import('../booster/services/roleService.js');
      const restored = await restoreRole(member.guild, member.id).catch(err => {
        log('error', 'GuildMemberAdd', `restoreRole error: ${err.message}`);
        return null;
      });

      if (!restored) return;

      const retentionDays = settings.retention?.days ?? 7;
      const ch = settings.logChannelId ? member.guild.channels.cache.get(settings.logChannelId) : null;
      ch?.send({
        content: `✨ <@${member.id}> rejoined while boosting — custom role restored automatically. (Saved for **${retentionDays} days** after leaving.)`,
      }).catch(() => {});

      member.send({
        content: `Welcome back to **${member.guild.name}** — your booster role **${doc.name}** was restored automatically because you rejoined while boosting.`,
      }).catch(() => {});
    } catch (err) {
      log('error', 'GuildMemberAdd', err.message);
    }
  },
};

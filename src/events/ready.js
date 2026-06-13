import { Events, ActivityType } from 'discord.js';
import { registerCommands } from '../handlers/commandLoader.js';
import { runStartupEmojiSweep } from '../booster/services/emojiCleanupService.js';
import { runGraceExpirySweep } from '../booster/services/cleanupService.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[Takina Games] Logged in as ${client.user.tag}`);
    console.log(`[Takina Games] Serving ${client.guilds.cache.size} guild(s)`);

    // Register slash commands
    try {
      await registerCommands(client);
    } catch (err) {
      console.error('[Takina Games] Failed to register commands:', err.message);
    }

    // Sweep orphaned tmpricon emojis from any previous crashed sessions
    try {
      await runStartupEmojiSweep(client);
    } catch (err) {
      console.error('[Takina Games] Emoji sweep error:', err.message);
    }

    // Recover grace period timers lost across bot restarts
    try {
      await runGraceExpirySweep(client);
    } catch (err) {
      console.error('[Takina Games] Grace sweep error:', err.message);
    }

    // Set bot presence
    client.user.setPresence({
      activities: [{ name: '\ud83c\udfae /setup to configure games', type: ActivityType.Playing }],
      status: 'online',
    });

    // Start game schedulers for every guild
    client.scheduler.startAll();

    console.log(`[Takina Games] \u2705 Ready!`);
  },
};

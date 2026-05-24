import { Events, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {

    // ── Slash commands ─────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[InteractionCreate] Error in /${interaction.commandName}:`, err);
        const reply = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    const customId = interaction.customId;

    // ── Setup panel: buttons, selects, modals ──────────────────────────────────
    if (customId?.startsWith('setup_')) {
      const setup = client.commands.get('setup');
      if (setup?.handleComponent) {
        try {
          await setup.handleComponent(interaction, client);
        } catch (err) {
          console.error('[InteractionCreate] Setup component error:', err);
          const reply = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
          if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
          else if (interaction.isModalSubmit()) await interaction.reply(reply).catch(() => {});
          else await interaction.update({ content: '❌ Something went wrong.', components: [] }).catch(() => {});
        }
      }
      return;
    }

    // ── .loot role inspect select menu ────────────────────────────────────────
    if (customId === 'loot_role_select') {
      const roleId  = interaction.values[0];
      const role    = interaction.guild.roles.cache.get(roleId);
      const hasRole = interaction.member.roles.cache.has(roleId);

      const embed = new EmbedBuilder()
        .setColor(hasRole ? (role?.color || 0x57F287) : 0x808080)
        .setTitle(hasRole ? `🔓 ${role?.name ?? 'Unknown Role'}` : `🔒 ${role?.name ?? 'Unknown Role'}`)
        .setDescription(
          hasRole
            ? `✅ You have unlocked **${role?.name}**!\n\nYou earned this by winning a game.`
            : `🔒 You haven't unlocked **${role?.name}** yet.\n\nWin a game — you have a **1 in 5 (20%)** chance to earn a random role from the pool.`
        )
        .setFooter({ text: 'Keep playing to unlock more!' });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── Game buttons / selects ─────────────────────────────────────────────────
    if ((interaction.isButton() || interaction.isAnySelectMenu()) && customId?.startsWith('tg_')) {
      await client.scheduler.handleInteraction(interaction);
    }
  },
};

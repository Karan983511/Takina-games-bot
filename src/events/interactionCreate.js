import { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {

    // ── Slash commands ────────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[InteractionCreate] Error in /${interaction.commandName}:`, err);
        const reply = { content: '❌ Something went wrong.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    const customId = interaction.customId;

    // ── Setup panel: buttons, selects, modals ─────────────────────────────────────────
    if (customId?.startsWith('setup_')) {
      const setup = client.commands.get('setup');
      if (setup?.handleComponent) {
        try {
          await setup.handleComponent(interaction, client);
        } catch (err) {
          console.error('[InteractionCreate] Setup component error:', err);
          const reply = { content: '❌ Something went wrong.', ephemeral: true };
          if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
          else if (interaction.isModalSubmit()) await interaction.reply(reply).catch(() => {});
          else await interaction.update({ content: '❌ Something went wrong.', components: [] }).catch(() => {});
        }
      }
      return;
    }

    // ── .loot per-role toggle ──────────────────────────────────────────────
    if (customId?.startsWith('loot_toggle_')) {
      const userId = customId.split('_').pop();
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '⛔ This isn\'t your loot panel!', ephemeral: true });
      }
      const roleId = interaction.values[0];
      const guildId = interaction.guild.id;
      const coll = client.config.getUserCollection(guildId, userId);
      const member = interaction.guild.members.cache.get(userId);
      const isEquipped = coll.equipped.includes(roleId);

      if (isEquipped) {
        client.config.unequipRole(guildId, userId, roleId);
        try { await member?.roles?.remove(roleId); } catch {}
      } else {
        client.config.equipRole(guildId, userId, roleId);
        try { await member?.roles?.add(roleId); } catch {}
      }

      // Rebuild the .loot embed in-place with original format
      const cfg = client.config.get(guildId);
      const roleIds = cfg.rewardRoleIds ?? [];
      const owned = new Set(client.config.getUserCollection(guildId, userId).owned);
      const equipped = new Set(client.config.getUserCollection(guildId, userId).equipped);

      const unlocked = [];
      const locked   = [];

      for (const rid of roleIds) {
        const role = interaction.guild.roles.cache.get(rid);
        if (!role) continue;
        const isOwned = owned.has(rid);
        if (isOwned) unlocked.push({ role, roleId: rid, isEquipped: equipped.has(rid) });
        else         locked.push({ role, roleId: rid });
      }

      const lines = [];
      if (unlocked.length) {
        lines.push('**✨ Unlocked**');
        for (const r of unlocked) {
          const indicator = r.isEquipped ? '✅' : '🔓';
          lines.push(`${indicator} <@&${r.roleId}>`);
        }
        if (locked.length) lines.push('');
      }
      if (locked.length) {
        lines.push('**Locked**');
        for (const r of locked) {
          lines.push(`🔒 \`${r.role.name}\``);
        }
      }

      const total = unlocked.length + locked.length;
      const allPercent = total ? Math.round((unlocked.length / total) * 100) : 0;

      const embed = new EmbedBuilder()
        .setColor(unlocked.length === total && total > 0 ? 0xFFD700 : unlocked.length > 0 ? 0x57F287 : 0x5865F2)
        .setTitle(`🎁 ${interaction.user.username}'s Loot`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${unlocked.length}/${total} unlocked (${allPercent}%) • Win games for a 1/5 chance to earn a role` })
        .setTimestamp();

      // Rebuild select menu
      const rows = [];
      if (unlocked.length) {
        const options = unlocked.map(r => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(r.role.name)
            .setValue(r.roleId)
            .setEmoji(r.isEquipped ? '✅' : '📦')
            .setDescription(r.isEquipped ? '✅ Equipped — select to remove' : '📦 Owned — select to equip');
        });
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_toggle_${userId}`)
            .setPlaceholder('🔧 Equip / Unequip a role...')
            .setMinValues(1).setMaxValues(1)
            .addOptions(options),
        ));
      }

      return interaction.update({ embeds: [embed], components: rows });
    }

    // ── Game buttons / selects ───────────────────────────────────────────────────────────
    if ((interaction.isButton() || interaction.isAnySelectMenu()) && customId?.startsWith('tg_')) {
      await client.scheduler.handleInteraction(interaction);
    }
  },
};

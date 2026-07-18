import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';

function getRoleEmoji(role) {
  if (role.unicodeEmoji) return role.unicodeEmoji;
  return '';
}

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

    // ── /bsetup dashboard interactions ─────────────────────────────────────────
    if (customId?.startsWith('bsetup_')) {
      try {
        const bsetup = client.commands.get('bsetup');
        if (bsetup?.handleComponent) await bsetup.handleComponent(interaction, client);
      } catch (err) {
        console.error('[InteractionCreate] bsetup interaction error:', err);
        const reply = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else if (interaction.isModalSubmit()) await interaction.reply(reply).catch(() => {});
        else await interaction.update({ content: '❌ Something went wrong.', components: [] }).catch(() => {});
      }
      return;
    }

    // ── .role setup interactions ───────────────────────────────────────────────
    if (customId?.startsWith('rolesetup_')) {
      try {
        const { handleRoleSetupInteraction } = await import('../booster/commands/roleSetup.js');
        await handleRoleSetupInteraction(interaction, client);
      } catch (err) {
        console.error('[InteractionCreate] roleSetup interaction error:', err);
        const reply = { content: '❌ Something went wrong with the role setup.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ── .role manage interactions ──────────────────────────────────────────────
    if (customId?.startsWith('rolemanage_')) {
      try {
        const { handleManageInteraction } = await import('../booster/commands/roleManage.js');
        await handleManageInteraction(interaction, client);
      } catch (err) {
        console.error('[InteractionCreate] roleManage interaction error:', err);
        const reply = { content: '❌ Something went wrong with role manage.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ── .role reset confirm/cancel ─────────────────────────────────────────────
    if (customId?.startsWith('rolereset_')) {
      const parts   = customId.split('_');
      const action  = parts[1];
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "⛔ This isn't your confirmation.", flags: MessageFlags.Ephemeral });
      }

      if (action === 'cancel') {
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('✅ Reset cancelled — nothing changed.')],
          components: [],
        });
      }

      if (action === 'confirm') {
        try {
          const guild = interaction.guild;
          const { default: BoosterRoleModel } = await import('../booster/models/BoosterRole.js');
          const doc = await BoosterRoleModel.findOne({ guildId: guild.id, userId: ownerId, active: true });
          if (!doc) {
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ No active role found.')],
              components: [],
            });
          }
          const discordRole = guild.roles.cache.get(doc.roleId);
          if (discordRole) {
            await discordRole.edit({ name: 'Booster Role', color: 0x99AAB5, icon: null, unicodeEmoji: null }).catch(() => {});
          }
          doc.name = 'Booster Role'; doc.color = '#99AAB5'; doc.colorSecondary = null;
          doc.iconType = 'none'; doc.icon = null;
          await doc.save();
          return interaction.update({
            embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Your role has been reset to defaults. Use `.role setup` to customize it again.')],
            components: [],
          });
        } catch (err) {
          console.error('[InteractionCreate] rolereset error:', err);
          return interaction.update({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Reset failed: ${err.message}`)],
            components: [],
          });
        }
      }
      return;
    }

    // ── .role delete confirm/cancel ────────────────────────────────────────────
    if (customId?.startsWith('roledelete_')) {
      const parts  = customId.split('_');
      const action = parts[1];
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "⛔ This isn't your confirmation.", flags: MessageFlags.Ephemeral });
      }

      if (action === 'cancel') {
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('✅ Cancelled — your role was not deleted.')],
          components: [],
        });
      }

      if (action === 'confirm') {
        try {
          const { deleteBoosterRole } = await import('../booster/services/roleService.js');
          const doc = await deleteBoosterRole(interaction.guild, ownerId);
          if (!doc) {
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⚠️ No active role found — it may have already been deleted.')],
              components: [],
            });
          }
          return interaction.update({
            embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Your role **${doc.name}** has been deleted.`)],
            components: [],
          });
        } catch (err) {
          console.error('[InteractionCreate] roledelete error:', err);
          return interaction.update({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Failed to delete: ${err.message}`)],
            components: [],
          });
        }
      }
      return;
    }

    // ── /setup (game bot setup) ────────────────────────────────────────────────
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

    // ── .loot equip/unequip select menu ───────────────────────────────────────
    if (customId?.startsWith('loot_toggle_')) {
      const userId = customId.split('_').pop();
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "⛔ This isn't your loot panel!", flags: MessageFlags.Ephemeral });
      }

      const roleId  = interaction.values[0];
      const guildId = interaction.guild.id;
      const coll    = client.config.getUserCollection(guildId, userId);
      const member  = interaction.guild.members.cache.get(userId)
                   ?? await interaction.guild.members.fetch(userId).catch(() => null);

      const isEquipped = coll.equipped.includes(roleId);
      if (isEquipped) {
        client.config.unequipRole(guildId, userId, roleId);
        await member?.roles.remove(roleId).catch(() => {});
      } else {
        client.config.equipRole(guildId, userId, roleId);
        await member?.roles.add(roleId).catch(() => {});
      }

      const cfg         = client.config.get(guildId);
      const roleIds     = cfg.rewardRoleIds ?? [];
      const updatedColl = client.config.getUserCollection(guildId, userId);
      const owned       = new Set(updatedColl.owned);
      const equipped    = new Set(updatedColl.equipped);

      const unlocked = [];
      const locked   = [];
      for (const rid of roleIds) {
        const role = interaction.guild.roles.cache.get(rid);
        if (!role) continue;
        if (owned.has(rid)) unlocked.push({ role, roleId: rid });
        else                locked.push({ role, roleId: rid });
      }

      const lines = [];
      if (unlocked.length) {
        lines.push('**✨ Unlocked**');
        for (const { role, roleId: rid } of unlocked) {
          const emoji     = getRoleEmoji(role);
          const indicator = equipped.has(rid) ? '✅' : '🔓';
          lines.push(`${indicator} ${emoji} <@&${rid}>`.trimEnd());
        }
        if (locked.length) lines.push('');
      }
      if (locked.length) {
        lines.push('**Locked**');
        for (const { role } of locked) {
          const emoji = getRoleEmoji(role);
          lines.push(`🔒 ${emoji} \`${role.name}\``.replace('  ', ' '));
        }
      }

      const total      = unlocked.length + locked.length;
      const allPercent = total ? Math.round((unlocked.length / total) * 100) : 0;

      const embed = new EmbedBuilder()
        .setColor(
          unlocked.length === total && total > 0 ? 0xFFD700
          : unlocked.length > 0 ? 0x57F287
          : 0x5865F2
        )
        .setTitle(`🎁 ${interaction.user.username}'s Loot`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${unlocked.length}/${total} unlocked (${allPercent}%) • Win games for a 1/5 chance to earn a role` })
        .setTimestamp();

      const rows = [];
      if (unlocked.length) {
        const options = unlocked.map(({ role, roleId: rid }) => {
          const isEq = equipped.has(rid);
          return new StringSelectMenuOptionBuilder()
            .setLabel(role.name).setValue(rid)
            .setEmoji(isEq ? '✅' : '📦')
            .setDescription(isEq ? '✅ Equipped — select to remove' : '📦 Owned — select to equip');
        });
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_toggle_${userId}`)
            .setPlaceholder('⚖️ Equip / Unequip a role...')
            .setMinValues(1).setMaxValues(1).addOptions(options),
        ));
      }

      return interaction.update({ embeds: [embed], components: rows });
    }

    // ── Booster dashboard + role list pagination ───────────────────────────────
    if (customId?.startsWith('booster_') || customId?.startsWith('rolelist_p_')) {
      try {
        const { handleBoosterInteraction } = await import('../booster/handlers/interactions.js');
        await handleBoosterInteraction(interaction, client);
      } catch (err) {
        console.error('[InteractionCreate] booster interaction error:', err);
        const reply = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ── Game buttons / selects ─────────────────────────────────────────────────
    if ((interaction.isButton() || interaction.isAnySelectMenu()) && customId?.startsWith('tg_')) {
      await client.scheduler.handleInteraction(interaction);
    }
  },
};

import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

/** Returns the role's emoji string (unicode or custom) or empty string. */
function getRoleEmoji(role) {
  if (role.unicodeEmoji) return role.unicodeEmoji;
  return '';
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // ── .loot ────────────────────────────────────────────────────────────────
    if (message.content.trim().toLowerCase() === '.loot') {
      const cfg     = client.config.get(message.guild.id);
      const roleIds = cfg.rewardRoleIds ?? [];

      if (!roleIds.length) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('🎁 Loot Pool')
              .setDescription('No reward roles have been set up yet.')
              .setFooter({ text: 'Admins can add roles with /setup → Reward Roles' }),
          ],
        });
      }

      const coll     = client.config.getUserCollection(message.guild.id, message.author.id);
      const owned    = new Set(coll.owned);
      const equipped = new Set(coll.equipped);

      const unlocked = [];
      const locked   = [];

      for (const roleId of roleIds) {
        const role = message.guild.roles.cache.get(roleId);
        if (!role) continue;
        if (owned.has(roleId)) unlocked.push({ role, roleId });
        else                   locked.push({ role, roleId });
      }

      // ── Build description ──────────────────────────────────────────────────
      const lines = [];
      if (unlocked.length) {
        lines.push('**✨ Unlocked**');
        for (const { role, roleId } of unlocked) {
          const emoji     = getRoleEmoji(role);
          const indicator = equipped.has(roleId) ? '✅' : '🔓';
          lines.push(`${indicator} ${emoji} <@&${roleId}>`.trimEnd());
        }
        if (locked.length) lines.push('');
      }
      if (locked.length) {
        lines.push('**Locked**');
        for (const { role, roleId } of locked) {
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
        .setTitle(`🎁 ${message.author.username}'s Loot`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setDescription(lines.join('\n'))
        .setFooter({
          text: `${unlocked.length}/${total} unlocked (${allPercent}%) • Win games for a 1/5 chance to earn a role`,
        })
        .setTimestamp();

      // ── Select menu: equip / unequip ───────────────────────────────────────
      const rows = [];
      if (unlocked.length) {
        const options = unlocked.map(({ role, roleId }) => {
          const isEquipped = equipped.has(roleId);
          const opt = new StringSelectMenuOptionBuilder()
            .setLabel(role.name)
            .setValue(roleId)
            .setEmoji(isEquipped ? '✅' : '📦')
            .setDescription(isEquipped ? '✅ Equipped — select to remove' : '📦 Owned — select to equip');
          return opt;
        });
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_toggle_${message.author.id}`)
            .setPlaceholder('⚖️ Equip / Unequip a role...')
            .setMinValues(1).setMaxValues(1)
            .addOptions(options),
        ));
      }

      return message.channel.send({ embeds: [embed], components: rows });
    }

    // ── Forward to game scheduler ──────────────────────────────────────────────────
    await client.scheduler.handleMessage(message);
  },
};

import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import BoosterRole from '../booster/models/BoosterRole.js';
import BoosterSettings from '../booster/models/BoosterSettings.js';
import { buildRoleListPayload } from '../booster/utils/roleListBuilder.js';
import { isBooster, isAdmin } from '../booster/utils/validators.js';

function getRoleEmoji(role) {
  if (role.unicodeEmoji) return role.unicodeEmoji;
  return '';
}

async function canCreateRole(member, guildId) {
  if (isAdmin(member)) return true;
  const settings = await BoosterSettings.findOne({ guildId }).lean();
  if (settings?.eligibilityRoleId) {
    return member.roles.cache.has(settings.eligibilityRoleId);
  }
  return isBooster(member);
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const lower   = content.toLowerCase();

    // ── .help ─────────────────────────────────────────────────────────────────
    if (lower === '.help') {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF47FFF)
            .setTitle('📖 Bot Help')
            .setDescription('Here\'s everything this bot can do.')
            .addFields(
              {
                name: '🎨 Custom Role Commands',
                value: [
                  '`.role setup` — Create or edit your custom booster role',
                  '`.role info` — View your role\'s name, color, icon & sharing',
                  '`.role overview` — See all active custom roles & next rotation time',
                  '`.role give @user` — Share your role with another member',
                  '`.role remove @user` — Remove a member from your role',
                  '`.role removeme` — Remove yourself from a role shared with you',
                  '`.role reset` — Reset your role to default settings (keeps the role)',
                  '`.role delete` — Permanently delete your custom role',
                ].join('\n'),
              },
              {
                name: '🎁 Loot',
                value: '`.loot` — View your unlocked reward roles and equip/unequip them',
              },
              {
                name: '⚙️ Admin',
                value: '`/bsetup` — Configure the booster role system (features, boundaries, logging, rotation, eligibility role, link roles)',
              },
            )
            .setFooter({ text: 'Custom roles are available to eligible members only.' }),
        ],
      });
    }

    // ── .role commands ────────────────────────────────────────────────────────
    if (lower.startsWith('.role')) {
      const args    = content.split(/\s+/);
      const sub     = args[1]?.toLowerCase();
      const { guild, author } = message;

      // Resolve a target member from: @mention, reply, or raw user ID
      async function resolveTarget() {
        const mentioned = message.mentions.members.first();
        if (mentioned) return mentioned;
        if (message.reference?.messageId) {
          const ref = await message.fetchReference().catch(() => null);
          if (ref?.author?.id) return guild.members.fetch(ref.author.id).catch(() => null);
        }
        const rawId = args[2]?.replace(/\D/g, '');
        if (rawId?.length >= 17) return guild.members.fetch(rawId).catch(() => null);
        return null;
      }

      // .role setup
      if (sub === 'setup' && args.length === 2) {
        const allowed = await canCreateRole(message.member, guild.id);
        if (!allowed) {
          const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();
          const roleRef = settings?.eligibilityRoleId
            ? `<@&${settings.eligibilityRoleId}>`
            : 'server booster';
          return message.channel.send({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Only members with the ${roleRef} role can create a custom role.`)],
          });
        }
        try {
          const { execute } = await import('../booster/commands/roleSetup.js');
          return await execute(message);
        } catch (err) {
          console.error('[messageCreate] .role setup error:', err);
          return message.channel.send({ content: '❌ Something went wrong with `.role setup`. Please try again.' });
        }
      }

      // .role info
      if (sub === 'info') {
        const role = await BoosterRole.findOne({ guildId: guild.id, userId: author.id });
        if (!role) {
          return message.channel.send({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You don't have a custom role. Run `.role setup` to create one.")],
          });
        }

        const discordRole = role.roleId ? guild.roles.cache.get(role.roleId) : null;

        let colorDisplay = role.color ?? '#99AAB5';
        if (role.colorSecondary) colorDisplay += ` → ${role.colorSecondary}`;

        let iconDisplay = 'None';
        let iconThumbnail = null;
        if (role.iconType === 'emoji' || role.iconType === 'custom') iconDisplay = role.icon ?? 'None';
        else if (role.iconType === 'image') {
          const iconUrl = discordRole?.iconURL({ size: 128 }) ?? null;
          iconDisplay   = iconUrl ? '📷 Custom image' : '📷 Custom image (role missing)';
          iconThumbnail = iconUrl;
        }

        let sharedDisplay = 'Nobody';
        if (role.sharedWith?.length) {
          // Fetch usernames and sort A-Z
          const withNames = await Promise.all(role.sharedWith.map(async id => {
            const m = guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
            return { id, name: (m?.displayName ?? m?.user?.username ?? id).toLowerCase() };
          }));
          withNames.sort((a, b) => a.name.localeCompare(b.name));
          sharedDisplay = withNames.map(({ id }) => `<@${id}>`).join(', ');
        }

        const statusLine = role.active
          ? (discordRole ? `✅ Active — ${discordRole}` : '⚠️ Active but Discord role missing')
          : '💤 Inactive (role removed while not eligible)';

        const embedColor = role.color
          ? parseInt(role.color.replace('#', ''), 16)
          : 0x5865F2;

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(embedColor)
              .setTitle(`🎨 ${role.name}`)
              .setThumbnail(iconThumbnail)
              .addFields(
                { name: '🎨 Color',       value: colorDisplay,  inline: true  },
                { name: '🖼️ Icon',        value: iconDisplay,   inline: true  },
                { name: '📊 Status',      value: statusLine,    inline: false },
                { name: '👥 Shared With', value: sharedDisplay, inline: false },
              )
              .setFooter({
                text: [
                  role.manuallyLinked ? '🔗 Manually linked by admin' : null,
                  `Created ${new Date(role.createdAt).toLocaleDateString()}`,
                ].filter(Boolean).join(' • '),
              }),
          ],
        });
      }

      // .role delete
      if (sub === 'delete') {
        const role = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });
        if (!role) {
          return message.channel.send({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You don't have an active custom role to delete.")],
          });
        }
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🗑️ Delete Custom Role')
              .setDescription(
                `Are you sure you want to delete your role **${role.name}**?\n\n` +
                (role.sharedWith.length ? `⚠️ This role is currently shared with **${role.sharedWith.length}** member(s) — they will lose it.\n\n` : '') +
                '**This cannot be undone.**'
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`roledelete_confirm_${author.id}`).setLabel('Yes, delete my role').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`roledelete_cancel_${author.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      // .role give @user | .role give <id> | reply + .role give
      if (sub === 'give') {
        const target = await resolveTarget();
        if (!target) return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No member found. Usage: `.role give @user`, `.role give <userID>`, or reply to their message with `.role give`')] });
        if (target.id === author.id) return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You can't give your role to yourself.")] });
        const role = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });
        if (!role) return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You don't have an active custom role. Run `.role setup` to create one.")] });
        const dr = guild.roles.cache.get(role.roleId);
        if (role.sharedWith.includes(target.id)) {
          // DB says they have it — check if Discord role is actually on them
          if (dr && target.roles.cache.has(dr.id)) {
            return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`⚠️ ${target.user.username} already has your role.`)] });
          }
          // Role was accidentally removed — silently re-add it
          if (dr) await target.roles.add(dr).catch(() => {});
          return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Re-gave your role **${role.name}** to ${target} (it was missing from them).`)] });
        }
        role.sharedWith.push(target.id);
        await role.save();
        if (dr) await target.roles.add(dr).catch(() => {});
        return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Gave your role **${role.name}** to ${target}.`)] });
      }

      // .role remove @user | .role remove <id> | reply + .role remove
      if (sub === 'remove') {
        // Try to resolve a live guild member first; fall back to raw ID for left members
        const target = await resolveTarget();
        const rawId  = target?.id ?? args[2]?.replace(/\D/g, '');
        if (!rawId || rawId.length < 17) {
          return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No member found. Usage: `.role remove @user`, `.role remove <userID>`, or reply to their message with `.role remove`')] });
        }
        const role = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });
        if (!role) return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You don't have an active custom role.")] });
        if (!role.sharedWith.includes(rawId)) {
          return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`⚠️ <@${rawId}> doesn't have your role.`)] });
        }
        role.sharedWith = role.sharedWith.filter(id => id !== rawId);
        await role.save();
        // Only attempt Discord role removal if the member is still in the server
        if (target) {
          const dr = guild.roles.cache.get(role.roleId);
          if (dr) await target.roles.remove(dr).catch(() => {});
        }
        return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed <@${rawId}> from **${role.name}**.`)] });
      }

      // .role removeme
      if (sub === 'removeme') {
        const roles = await BoosterRole.find({ guildId: guild.id, sharedWith: author.id, active: true });
        if (!roles.length) return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You're not in anyone's shared role.")] });
        if (roles.length === 1) {
          const role = roles[0];
          role.sharedWith = role.sharedWith.filter(id => id !== author.id);
          await role.save();
          const dr = guild.roles.cache.get(role.roleId);
          if (dr) await message.member.roles.remove(dr).catch(() => {});
          return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed yourself from **${role.name}**.`)] });
        }
        // Multiple shared roles — show a select menu
        const options = roles.slice(0, 25).map(r => {
          const owner = guild.members.cache.get(r.userId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(r.name.slice(0, 100))
            .setValue(r.roleId)
            .setDescription(`Owner: ${owner?.user.username ?? r.userId}`);
        });
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`rolerm_select_${author.id}`)
            .setPlaceholder('Which role do you want to leave?')
            .setMinValues(1).setMaxValues(1)
            .addOptions(options),
        );
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Leave a Shared Role').setDescription(`You have **${roles.length}** shared roles. Pick the one you want to leave:`)],
          components: [row],
        });
      }

      // .role reset — wipe name/color/icon back to defaults without deleting the role
      if (sub === 'reset') {
        const role = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });
        if (!role) {
          return message.channel.send({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription("❌ You don't have an active custom role to reset.")],
          });
        }
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('🔄 Reset Custom Role')
              .setDescription(
                `This will reset **${role.name}** back to default settings:\n\n` +
                '• Name → `Booster Role`\n' +
                '• Color → `#99AAB5` (Discord default grey)\n' +
                '• Icon → removed\n\n' +
                '**Your role will not be deleted.** Shared members keep the role.\n\n' +
                'Are you sure?'
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rolereset_confirm_${author.id}`).setLabel('Yes, reset my role').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`rolereset_cancel_${author.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      // .role list
      if (sub === 'overview') {
        const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();
        const payload  = await buildRoleListPayload(guild, settings, 0);
        return message.channel.send(payload);
      }

      // Unknown .role subcommand — show role-specific help
      if (sub && sub !== 'setup') {
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Role Commands')
            .addFields(
              { name: '`.role setup`',        value: 'Open the custom role editor (create or edit your role)' },
              { name: '`.role info`',         value: "View your current role — name, colors, icon, and who it's shared with" },
              { name: '`.role give @user`',   value: 'Give your custom role to another member' },
              { name: '`.role remove @user`', value: 'Remove a member from your custom role' },
              { name: '`.role removeme`',     value: 'Remove yourself from a role that was shared with you' },
              { name: '`.role reset`',        value: 'Reset your role back to default name/color/icon (keeps the role, just wipes settings)' },
              { name: '`.role delete`',       value: 'Permanently delete your custom role' },
              { name: '`.role overview`',         value: 'See all active custom roles in the server & when the next rotation fires' },
            )
            .setFooter({ text: 'Type .help for the full command list.' })],
        });
      }
    }

    // ── Role setup message input handler ──────────────────────────────────────
    {
      const { handleRoleSetupMessage } = await import('../booster/commands/roleSetup.js');
      const consumed = await handleRoleSetupMessage(message);
      if (consumed) return;
    }

    // ── .loot ─────────────────────────────────────────────────────────────────
    if (lower === '.loot') {
      const cfg     = client.config.get(message.guild.id);
      const roleIds = cfg.rewardRoleIds ?? [];

      if (!roleIds.length) {
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎁 Loot Pool')
            .setDescription('No reward roles have been set up yet.')
            .setFooter({ text: 'Admins can add roles with /setup → Reward Roles' })],
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
        .setColor(unlocked.length === total && total > 0 ? 0xFFD700 : unlocked.length > 0 ? 0x57F287 : 0x5865F2)
        .setTitle(`🎁 ${message.author.username}'s Loot`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${unlocked.length}/${total} unlocked (${allPercent}%) • Win games for a 1/5 chance to earn a role` })
        .setTimestamp();

      const rows = [];
      if (unlocked.length) {
        const options = unlocked.map(({ role, roleId }) => {
          const isEquipped = equipped.has(roleId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(role.name).setValue(roleId)
            .setEmoji(isEquipped ? '✅' : '📦')
            .setDescription(isEquipped ? '✅ Equipped — select to remove' : '📦 Owned — select to equip');
        });
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`loot_toggle_${message.author.id}`)
            .setPlaceholder('⚖️ Equip / Unequip a role...')
            .setMinValues(1).setMaxValues(1).addOptions(options),
        ));
      }

      return message.channel.send({ embeds: [embed], components: rows });
    }

    // ── Forward to game scheduler ─────────────────────────────────────────────
    await client.scheduler.handleMessage(message);
  },
};

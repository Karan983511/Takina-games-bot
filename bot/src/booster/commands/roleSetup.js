/**
 * .role setup — Persistent custom role setup wizard
 *
 * Supports: name, one or two hex colors, icon (emoji or image upload)
 * Nothing applies to Discord until the user clicks Save.
 * Works within admin-configured role boundaries.
 * Checks the required role (if configured) before allowing creation.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';
import { getInsertPosition, assertBoundary } from '../utils/boundary.js';
import { normalizeHex } from '../utils/validators.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { getSettings } from '../services/settingsService.js';

// ─── In-memory session store (per user per guild) ─────────────────────────────
// shape: { name, color1, color2, iconType, iconValue, messageId, channelId }
const sessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function getSession(guildId, userId) {
  return sessions.get(sessionKey(guildId, userId)) ?? null;
}

export function setSession(guildId, userId, data) {
  sessions.set(sessionKey(guildId, userId), { ...data });
}

export function clearSession(guildId, userId) {
  sessions.delete(sessionKey(guildId, userId));
}

// ─── Build the setup embed ────────────────────────────────────────────────────

function buildSetupEmbed(session) {
  const name   = session.name   ?? '*Not set*';
  const color1 = session.color1 ?? null;
  const color2 = session.color2 ?? null;

  let colorDisplay = '*Not set*';
  if (color1 && color2) colorDisplay = `${color1} → ${color2}`;
  else if (color1)      colorDisplay = color1;

  let iconDisplay = '*Not set*';
  if (session.iconType === 'emoji')  iconDisplay = session.iconValue;
  if (session.iconType === 'custom') iconDisplay = session.iconValue;
  if (session.iconType === 'image')  iconDisplay = '✅ Image uploaded';

  const embedColor = color1
    ? parseInt(color1.replace('#', ''), 16)
    : 0x5865F2;

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('✨ Custom Role Setup')
    .setDescription(
      '━━━━━━━━━━━━━━━━━━\n' +
      'Click an option below to edit it.\n' +
      'Nothing changes on Discord until you hit **Save**.\n' +
      '━━━━━━━━━━━━━━━━━━'
    )
    .addFields(
      { name: '1️⃣  Name',   value: name,        inline: false },
      { name: '2️⃣  Colors', value: colorDisplay, inline: false },
      { name: '3️⃣  Icon',   value: iconDisplay,  inline: false },
    )
    .setFooter({ text: 'Use 4️⃣ Preview to check your settings, then 5️⃣ Save.' })
    .setTimestamp();
}

// ─── Build the action row ─────────────────────────────────────────────────────

function buildSetupRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rolesetup_name').setLabel('1️⃣ Name').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_colors').setLabel('2️⃣ Colors').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_icon').setLabel('3️⃣ Icon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_preview').setLabel('4️⃣ Preview').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rolesetup_save').setLabel('5️⃣ Save').setStyle(ButtonStyle.Success),
  );
}

// ─── Required role guard ──────────────────────────────────────────────────────

async function checkRequiredRole(guild, userId) {
  const settings = await getSettings(guild.id);
  if (!settings.requiredRoleId) return null; // no restriction

  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  if (!member?.roles.cache.has(settings.requiredRoleId)) {
    return settings.requiredRoleId; // return the role ID so caller can mention it
  }
  return null; // has the role — OK
}

// ─── Entry point: .role setup ────────────────────────────────────────────────

export async function execute(message) {
  const { guild, author } = message;

  // Required role check
  const missingRoleId = await checkRequiredRole(guild, author.id);
  if (missingRoleId) {
    return message.channel.send({
      embeds: [errorEmbed(`You need the <@&${missingRoleId}> role to create a custom booster role.`)],
    });
  }

  const key = sessionKey(guild.id, author.id);

  // Load existing role data if the user already has one
  const existing = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });

  let session = sessions.get(key);
  if (!session) {
    session = {
      name:      existing?.name  ?? null,
      color1:    existing?.color ?? null,
      color2:    null,
      iconType:  null,
      iconValue: null,
      ...(existing?.icon ? { iconType: 'emoji', iconValue: existing.icon } : {}),
      awaitingInput: null,
      messageId:     null,
      channelId:     null,
    };
    sessions.set(key, session);
  }

  const embed = buildSetupEmbed(session);
  const row   = buildSetupRow();

  const sent = await message.channel.send({ embeds: [embed], components: [row] });
  session.messageId  = sent.id;
  session.channelId  = sent.channelId;
  sessions.set(key, session);
}

// ─── Shared: refresh the setup embed after a change ──────────────────────────

export async function refreshSetupMessage(channel, session) {
  if (!session.messageId) return;
  try {
    const msg = await channel.messages.fetch(session.messageId);
    await msg.edit({ embeds: [buildSetupEmbed(session)], components: [buildSetupRow()] });
  } catch {
    // Message may have been deleted — not fatal
  }
}

// ─── Build the preview embed ──────────────────────────────────────────────────

function buildPreviewEmbed(session) {
  const name   = session.name   ?? '*(unnamed)*';
  const color1 = session.color1 ?? '#99AAB5';
  const color2 = session.color2 ?? null;

  const colorLine = color2 ? `${color1} → ${color2}` : color1;

  let iconLine = 'None';
  if (session.iconType === 'emoji')  iconLine = session.iconValue;
  if (session.iconType === 'custom') iconLine = session.iconValue;
  if (session.iconType === 'image')  iconLine = '📷 Uploaded image';

  return new EmbedBuilder()
    .setColor(parseInt(color1.replace('#', ''), 16))
    .setTitle(`🎨 Preview — ${name}`)
    .setDescription('This is how your role will look when saved.')
    .addFields(
      { name: 'Role Name', value: name,      inline: true },
      { name: 'Color(s)',  value: colorLine, inline: true },
      { name: 'Icon',      value: iconLine,  inline: true },
    )
    .setFooter({ text: 'Click Save in the setup menu to apply these settings.' });
}

// ─── Interaction handler (called from interactionCreate) ──────────────────────

export async function handleRoleSetupInteraction(interaction, client) {
  const id     = interaction.customId;
  const userId = interaction.user.id;
  const guild  = interaction.guild;

  if (!id.startsWith('rolesetup_')) return false;

  const session = getSession(guild.id, userId);
  if (!session) {
    return interaction.reply({
      embeds: [errorEmbed('Your setup session expired. Run `.role setup` again.')],
      flags:  MessageFlags.Ephemeral,
    });
  }

  // ── 1️⃣ Name ────────────────────────────────────────────────────────────────
  if (id === 'rolesetup_name') {
    session.awaitingInput = 'name';
    setSession(guild.id, userId, session);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('1️⃣ Set Role Name')
          .setDescription('Send your desired role name in this channel.\n\nExample:\n```\nDragon Slayer\n```'),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ── 2️⃣ Colors ──────────────────────────────────────────────────────────────
  if (id === 'rolesetup_colors') {
    session.awaitingInput = 'colors';
    setSession(guild.id, userId, session);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('2️⃣ Set Colors')
          .setDescription(
            'Send **one** hex color for a solid color:\n```\n#ff6793\n```\n' +
            'Or **two** hex colors for a gradient display:\n```\n#ff6793 #ff8e3a\n```\n' +
            '*The first color becomes the Discord role color.*'
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ── 3️⃣ Icon ─────────────────────────────────────────────────────────────────
  if (id === 'rolesetup_icon') {
    session.awaitingInput = 'icon';
    setSession(guild.id, userId, session);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('3️⃣ Set Icon')
          .setDescription(
            'Send one of the following:\n\n' +
            '• **A unicode emoji** — `😀` `👑` `⭐`\n' +
            '• **A custom Discord emoji** — `<:crown:123456789>`\n' +
            '• **An image** — Upload a PNG, JPG, or WEBP file\n\n' +
            '> Role icons require your server to be at boost level 2+.'
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ── 4️⃣ Preview ──────────────────────────────────────────────────────────────
  if (id === 'rolesetup_preview') {
    return interaction.reply({
      embeds: [buildPreviewEmbed(session)],
      flags:  MessageFlags.Ephemeral,
    });
  }

  // ── 5️⃣ Save ─────────────────────────────────────────────────────────────────
  if (id === 'rolesetup_save') {
    if (!session.name) {
      return interaction.reply({
        embeds: [errorEmbed('Please set a **name** before saving.')],
        flags:  MessageFlags.Ephemeral,
      });
    }
    if (!session.color1) {
      return interaction.reply({
        embeds: [errorEmbed('Please set at least one **color** before saving.')],
        flags:  MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Re-check required role at save time
      const missingRoleId = await checkRequiredRole(guild, userId);
      if (missingRoleId) {
        clearSession(guild.id, userId);
        return interaction.editReply({
          embeds: [errorEmbed(`You no longer have the required role <@&${missingRoleId}> — role cannot be saved.`)],
        });
      }

      const existing = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });

      if (existing) {
        // ── Edit existing role ───────────────────────────────────────────────
        const discordRole = guild.roles.cache.get(existing.roleId);
        if (!discordRole) throw new Error('Your Discord role no longer exists. Try `.booster restore`.');
        await assertBoundary(guild, discordRole);

        const patch = { name: session.name, color: session.color1 };
        if (session.iconType === 'emoji' || session.iconType === 'custom') {
          patch.unicodeEmoji = session.iconValue;
          patch.icon = null;
        } else if (session.iconType === 'image' && session.iconBuffer) {
          patch.icon = session.iconBuffer;
          patch.unicodeEmoji = null;
        }

        await discordRole.edit(patch);

        existing.name  = session.name;
        existing.color = session.color1;
        if (session.color2) existing.colorSecondary = session.color2;
        if (session.iconType) existing.iconType = session.iconType;
        if (session.iconType === 'emoji' || session.iconType === 'custom') existing.icon = session.iconValue;
        else if (session.iconType === 'image') existing.icon = null;
        await existing.save();

        await audit(client, guild.id, userId, 'ROLE_EDITED', {
          name:  session.name,
          color: session.color1,
        });

        clearSession(guild.id, userId);
        return interaction.editReply({
          embeds: [successEmbed(`Your role **${session.name}** has been updated! ${discordRole}`)],
        });

      } else {
        // ── Create new role ──────────────────────────────────────────────────
        const position = await getInsertPosition(guild);
        const roleData = {
          name:        session.name,
          color:       session.color1,
          hoist:       false,
          mentionable: false,
          position,
        };

        if (session.iconType === 'emoji' || session.iconType === 'custom') {
          roleData.unicodeEmoji = session.iconValue;
        } else if (session.iconType === 'image' && session.iconBuffer) {
          roleData.icon = session.iconBuffer;
        }

        let discordRole;
        try {
          discordRole = await guild.roles.create(roleData);
        } catch (err) {
          // Icon may be rejected — create without it
          if (err.message?.toLowerCase().includes('icon') || err.code === 50013) {
            delete roleData.icon;
            delete roleData.unicodeEmoji;
            discordRole = await guild.roles.create(roleData);
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xFEE75C)
                  .setTitle('⚠️ Role created without icon')
                  .setDescription(
                    `${discordRole} was created, but Discord rejected the icon.\n\n` +
                    `This usually happens when the server isn't at boost level 2+, ` +
                    `or the image format is unsupported. You can set an icon later.`
                  ),
              ],
            });
            await BoosterRole.findOneAndUpdate(
              { guildId: guild.id, userId },
              { $set: { roleId: discordRole.id, name: session.name, color: session.color1, colorSecondary: session.color2 ?? null, iconType: 'none', icon: null, active: true, softDeletedAt: null } },
              { upsert: true, new: true }
            );
            const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(discordRole).catch(() => {});
            await audit(client, guild.id, userId, 'ROLE_CREATED', { name: session.name, color: session.color1, roleId: discordRole.id });
            clearSession(guild.id, userId);
            return;
          }
          throw err;
        }

        const iconTypeToSave = session.iconType && session.iconType !== 'none' ? session.iconType : 'none';

        await BoosterRole.findOneAndUpdate(
          { guildId: guild.id, userId },
          {
            $set: {
              roleId:         discordRole.id,
              name:           session.name,
              color:          session.color1,
              colorSecondary: session.color2 ?? null,
              iconType:       iconTypeToSave,
              icon:           (session.iconType === 'emoji' || session.iconType === 'custom') ? session.iconValue : null,
              active:         true,
              softDeletedAt:  null,
            },
          },
          { upsert: true, new: true }
        );

        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(discordRole).catch(() => {});

        await audit(client, guild.id, userId, 'ROLE_CREATED', {
          name:   session.name,
          color:  session.color1,
          roleId: discordRole.id,
        });

        clearSession(guild.id, userId);
        return interaction.editReply({
          embeds: [successEmbed(`Your custom role **${session.name}** has been created! ${discordRole}`)],
        });
      }
    } catch (err) {
      console.error('[roleSetup] Save error:', err);
      return interaction.editReply({
        embeds: [errorEmbed(`Failed to save: ${err.message}`)],
      });
    }
  }

  return false;
}

// ─── Message input handler (called from messageCreate) ───────────────────────
// Returns true if it consumed the message, false otherwise.

export async function handleRoleSetupMessage(message) {
  const { guild, author, channel } = message;
  const session = getSession(guild.id, author.id);

  if (!session || !session.awaitingInput) return false;

  const input = session.awaitingInput;
  session.awaitingInput = null;

  if (input === 'name') {
    const name = message.content.trim().slice(0, 100);
    if (!name) {
      await message.reply({ embeds: [errorEmbed('Name cannot be empty.')] });
      return true;
    }
    session.name = name;
    setSession(guild.id, author.id, session);

    await message.delete().catch(() => {});

    await channel.send({
      embeds: [successEmbed(`Name set to **${name}**.`)],
    }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));

    await refreshSetupMessage(channel, session);
    return true;
  }

  if (input === 'colors') {
    const parts = message.content.trim().split(/\s+/);
    const hex1  = normalizeHex(parts[0]);
    const hex2  = parts[1] ? normalizeHex(parts[1]) : null;

    await message.delete().catch(() => {});

    if (!hex1) {
      await channel.send({
        embeds: [errorEmbed('Invalid hex color. Use format `#FF6793` or `#FF6793 #FF8E3A`.')],
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session);
      return true;
    }

    if (parts[1] && !hex2) {
      await channel.send({
        embeds: [errorEmbed(`Second color \`${parts[1]}\` is invalid. Use a proper hex code like \`#FF8E3A\`.`)],
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session);
      return true;
    }

    session.color1 = hex1;
    session.color2 = hex2 ?? null;
    setSession(guild.id, author.id, session);

    const colorMsg = hex2 ? `${hex1} → ${hex2}` : hex1;
    await channel.send({
      embeds: [successEmbed(`Color set to **${colorMsg}**.`)],
    }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));

    await refreshSetupMessage(channel, session);
    return true;
  }

  if (input === 'icon') {
    await message.delete().catch(() => {});

    // ── Image upload? ──────────────────────────────────────────────────────
    if (message.attachments.size > 0) {
      const att         = message.attachments.first();
      const contentType = att.contentType ?? '';
      const allowed     = ['image/png', 'image/jpeg', 'image/webp'];

      if (!allowed.some(t => contentType.startsWith(t))) {
        await channel.send({
          embeds: [errorEmbed('Invalid file type. Only PNG, JPG, or WEBP images are supported.')],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session);
        return true;
      }

      if (att.size > 256 * 1024) {
        await channel.send({
          embeds: [errorEmbed('Image too large. Role icons must be under 256 KB.')],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session);
        return true;
      }

      try {
        const res = await fetch(att.url);
        const buf = Buffer.from(await res.arrayBuffer());
        session.iconType   = 'image';
        session.iconValue  = att.name;
        session.iconBuffer = buf;
        setSession(guild.id, author.id, session);

        await channel.send({
          embeds: [successEmbed('✅ Image icon saved. It will be applied when you click **Save**.')],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));

        await refreshSetupMessage(channel, session);
        return true;
      } catch {
        await channel.send({
          embeds: [errorEmbed('Failed to download your image. Please try again.')],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session);
        return true;
      }
    }

    // ── Text — emoji or custom emoji ───────────────────────────────────────
    const text = message.content.trim();

    const customMatch = text.match(/^<a?:\w+:\d+>$/);
    if (customMatch) {
      session.iconType   = 'custom';
      session.iconValue  = text;
      session.iconBuffer = null;
      setSession(guild.id, author.id, session);

      await channel.send({
        embeds: [successEmbed(`Icon set to ${text}.`)],
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
      await refreshSetupMessage(channel, session);
      return true;
    }

    const unicodeEmojiPattern = /^\p{Emoji_Presentation}|\p{Extended_Pictographic}$/u;
    if (unicodeEmojiPattern.test(text) && [...text].length <= 4) {
      session.iconType   = 'emoji';
      session.iconValue  = text;
      session.iconBuffer = null;
      setSession(guild.id, author.id, session);

      await channel.send({
        embeds: [successEmbed(`Icon set to ${text}.`)],
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
      await refreshSetupMessage(channel, session);
      return true;
    }

    await channel.send({
      embeds: [errorEmbed('Please send a unicode emoji, a custom Discord emoji, or upload a PNG/JPG/WEBP image.')],
    }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    session.awaitingInput = 'icon';
    setSession(guild.id, author.id, session);
    return true;
  }

  return false;
}

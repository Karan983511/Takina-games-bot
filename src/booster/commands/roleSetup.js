/**
 * .role setup — Persistent custom role setup wizard
 *
 * Supports: name, one or two hex colors, icon (emoji or image upload)
 * Nothing applies to Discord until the user clicks Save.
 * Works within admin-configured role boundaries.
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
import { get as httpsGet } from 'https';

// ─── In-memory session store (per user per guild) ─────────────────────────────
const sessions = new Map();

// ─── Reliable image downloader using Node https module ────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    function doGet(target) {
      httpsGet(target, { headers: { 'User-Agent': 'TakinaGamesBot/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject)
        .setTimeout(12000, function() { this.destroy(); reject(new Error('timeout')); });
    }
    doGet(url);
  });
}

function sessionKey(guildId, userId) { return `${guildId}:${userId}`; }

export function getSession(guildId, userId)          { return sessions.get(sessionKey(guildId, userId)) ?? null; }
export function setSession(guildId, userId, data)    { sessions.set(sessionKey(guildId, userId), { ...data }); }
export function clearSession(guildId, userId)        { sessions.delete(sessionKey(guildId, userId)); }

// ─── Boost-level icon support check ──────────────────────────────────────────
function supportsRoleIcons(guild) {
  // premiumTier: 0 = none, 1 = level 1, 2 = level 2, 3 = level 3
  return guild.premiumTier >= 2;
}

// ─── Strip icon from roleData if server can't support it ─────────────────────
function stripIconIfUnsupported(guild, roleData) {
  if (supportsRoleIcons(guild)) return { stripped: false };
  delete roleData.icon;
  delete roleData.unicodeEmoji;
  return { stripped: true };
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
  if (session.iconType === 'image')  iconDisplay = '📷 Image (saved — re-upload to change)';
  if (session.iconType === 'custom' && session.iconTempEmojiId) iconDisplay = '📷 Image ready to apply';

  const embedColor = color1 ? parseInt(color1.replace('#', ''), 16) : 0x5865F2;

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

function buildSetupRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rolesetup_name').setLabel('1️⃣ Name').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_colors').setLabel('2️⃣ Colors').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_icon').setLabel('3️⃣ Icon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rolesetup_preview').setLabel('4️⃣ Preview').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rolesetup_save').setLabel('5️⃣ Save').setStyle(ButtonStyle.Success),
  );
}

// ─── Entry point: .role setup ────────────────────────────────────────────────
export async function execute(message) {
  const { guild, author } = message;
  const key = sessionKey(guild.id, author.id);

  const existing = await BoosterRole.findOne({ guildId: guild.id, userId: author.id, active: true });

  let session = sessions.get(key);
  if (!session) {
    const isCustomEmoji   = existing?.icon ? /^<a?:\w+:\d+>$/.test(existing.icon) : false;
    const isDiscordHosted = existing?.icon === 'discord_hosted';
    const isStaleDataURI  = existing?.icon ? existing.icon.startsWith('data:') : false;
    session = {
      name:      existing?.name           ?? null,
      color1:    existing?.color          ?? null,
      color2:    existing?.colorSecondary ?? null,
      iconType:  null,
      iconValue: null,
      iconUrl: null,
      iconTempEmojiId: null,
      ...(existing?.icon && !isStaleDataURI
        ? { iconType: isCustomEmoji ? 'custom' : isDiscordHosted ? 'image' : 'emoji',
            iconValue: isDiscordHosted ? 'discord_hosted' : existing.icon }
        : {}),
      awaitingInput: null,
      messageId:     null,
      channelId:     null,
    };
    sessions.set(key, session);
  }

  const embed = buildSetupEmbed(session);
  const row   = buildSetupRow();
  const sent  = await message.channel.send({ embeds: [embed], components: [row] });
  session.messageId = sent.id;
  session.channelId = sent.channelId;
  sessions.set(key, session);
}

// ─── Refresh the setup embed ──────────────────────────────────────────────────
export async function refreshSetupMessage(channel, session) {
  if (!session.messageId) return;
  try {
    const msg = await channel.messages.fetch(session.messageId);
    await msg.edit({ embeds: [buildSetupEmbed(session)], components: [buildSetupRow()] });
  } catch { /* deleted — not fatal */ }
}

// ─── Preview embed ────────────────────────────────────────────────────────────
function buildPreviewEmbed(session) {
  const name   = session.name   ?? '*(unnamed)*';
  const color1 = session.color1 ?? '#99AAB5';
  const color2 = session.color2 ?? null;
  const colorLine = color2 ? `${color1} → ${color2}` : color1;
  let iconLine = 'None';
  if (session.iconType === 'emoji')  iconLine = session.iconValue;
  if (session.iconType === 'custom') iconLine = session.iconValue;
  if (session.iconType === 'image')  iconLine = '📷 Image (Discord-hosted)';
  if (session.iconType === 'custom' && session.iconTempEmojiId) iconLine = '📷 Custom image';
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

// ─── Interaction handler ──────────────────────────────────────────────────────
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
        new EmbedBuilder().setColor(0x5865F2).setTitle('1️⃣ Set Role Name')
          .setDescription('Send your desired role name in this channel.\n\nExample:\n```\nShadow Crown\n```'),
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
        new EmbedBuilder().setColor(0x5865F2).setTitle('2️⃣ Set Colors')
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
    const freshGuild = await guild.fetch().catch(() => guild);
    const canUseIcon = freshGuild.premiumTier >= 2;
    session.awaitingInput = 'icon';
    setSession(guild.id, userId, session);

    const desc = canUseIcon
      ? (
        'Send one of the following:\n\n' +
        '• **A unicode emoji** — `😀` `👑` `⭐`\n' +
        '• **A custom Discord emoji** — `<:crown:123456789>`\n' +
        '• **An image** — Upload a PNG, JPG, or WEBP file (max 256 KB)'
      )
      : (
        '⚠️ **Your server is not at boost level 2**, so role icons are disabled by Discord.\n\n' +
        'You can still set an icon here — it will be saved and applied automatically once your server reaches level 2.\n\n' +
        '• **A unicode emoji** — `😀` `👑` `⭐`\n' +
        '• **A custom Discord emoji** — `<:crown:123456789>`\n' +
        '• **An image** — Upload a PNG, JPG, or WEBP file (max 256 KB)'
      );

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(canUseIcon ? 0x5865F2 : 0xFEE75C).setTitle('3️⃣ Set Icon').setDescription(desc)],
      flags:  MessageFlags.Ephemeral,
    });
  }

  // ── 4️⃣ Preview ──────────────────────────────────────────────────────────────
  if (id === 'rolesetup_preview') {
    return interaction.reply({ embeds: [buildPreviewEmbed(session)], flags: MessageFlags.Ephemeral });
  }

  // ── 5️⃣ Save ─────────────────────────────────────────────────────────────────
  if (id === 'rolesetup_save') {
    if (!session.name)   return interaction.reply({ embeds: [errorEmbed('Please set a **name** before saving.')],  flags: MessageFlags.Ephemeral });
    if (!session.color1) return interaction.reply({ embeds: [errorEmbed('Please set at least one **color** before saving.')], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const existing = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });

      // ── Helper: build icon fields ──────────────────────────────────────────
      // Always fetch fresh guild so premiumTier is accurate
      const freshGuild  = await guild.fetch().catch(() => guild);
      const canUseIcons = freshGuild.premiumTier >= 2;

      async function resolveIconFields() {
        if (session.iconType === 'custom') {
          const match = session.iconValue?.match(/^<a?:\w+:(\d+)>$/);
          if (match) {
            const ext = session.iconValue.startsWith('<a:') ? 'gif' : 'png';
            try {
              const r   = await fetch(`https://cdn.discordapp.com/emojis/${match[1]}.${ext}`);
              const buf = Buffer.from(await r.arrayBuffer());
              // Must use data URI — Discord.js encodes raw Buffers as image/jpg regardless of format
              return { icon: `data:image/${ext};base64,${buf.toString('base64')}`, unicodeEmoji: null };
            } catch { return {}; }
          }
        }
        if (session.iconType === 'emoji') return { unicodeEmoji: session.iconValue, icon: null };
        // No new icon set — preserve existing role icon as-is
        return {};
      }

      const iconFields  = await resolveIconFields();
      const iconSaved   = session.iconType && Object.keys(iconFields).length > 0;
      const iconSkipped = iconSaved && !canUseIcons;
      // Only spread icon into the Discord API call if the server actually supports role icons
      const appliedFields = (iconSaved && canUseIcons) ? iconFields : {};

      if (existing) {
        // ── Edit existing role ───────────────────────────────────────────────
        const discordRole = guild.roles.cache.get(existing.roleId);
        if (!discordRole) throw new Error('Your Discord role no longer exists.');
        await assertBoundary(guild, discordRole);

        await discordRole.edit({ name: session.name, color: session.color1, ...appliedFields });

        existing.name           = session.name;
        existing.color          = session.color1;
        existing.colorSecondary = session.color2 ?? null;
        existing.iconType = session.iconTempEmojiId ? 'image' : (session.iconType ?? 'none');
        existing.icon     = session.iconTempEmojiId ? 'discord_hosted' : (session.iconType === 'image' ? 'discord_hosted' : (session.iconValue ?? null));
        await existing.save();

        // Delete the temp emoji now that the role icon has been applied
        if (session.iconTempEmojiId) {
          await guild.emojis.delete(session.iconTempEmojiId, 'Role icon applied — removing temp emoji').catch(() => {});
        }

        await audit(client, guild.id, userId, 'ROLE_EDITED', { name: session.name, color: session.color1 });
        clearSession(guild.id, userId);

        const note = iconSkipped ? '\n\n> 🔒 Icon saved but not applied — your server needs boost level 2 for role icons.' : '';
        return interaction.editReply({ embeds: [successEmbed(`Your role **${session.name}** has been updated! ${discordRole}${note}`)] });
      } else {
        // ── Create new role ──────────────────────────────────────────────────
        const position = await getInsertPosition(guild);
        const roleData = { name: session.name, color: session.color1, hoist: false, mentionable: false, ...appliedFields };

        const discordRole = await guild.roles.create(roleData);
        await discordRole.setPosition(position).catch(() => {});

        await BoosterRole.findOneAndUpdate(
          { guildId: guild.id, userId },
          {
            $set: {
              roleId:         discordRole.id,
              name:           session.name,
              color:          session.color1,
              colorSecondary: session.color2 ?? null,
              iconType:       session.iconTempEmojiId ? 'image' : (session.iconType ?? 'none'),
              icon:           session.iconTempEmojiId ? 'discord_hosted' : (session.iconType === 'image' ? 'discord_hosted' : (session.iconValue ?? null)),
              active:         true,
              softDeletedAt:  null,
            },
          },
          { upsert: true, new: true }
        );

        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(discordRole).catch(() => {});

        // Delete the temp emoji now that the role icon has been applied
        if (session.iconTempEmojiId) {
          await guild.emojis.delete(session.iconTempEmojiId, 'Role icon applied — removing temp emoji').catch(() => {});
        }

        await audit(client, guild.id, userId, 'ROLE_CREATED', { name: session.name, color: session.color1, roleId: discordRole.id });
        clearSession(guild.id, userId);

        const note = iconSkipped ? '\n\n> 🔒 Icon saved but not applied — your server needs boost level 2 for role icons.' : '';
        return interaction.editReply({ embeds: [successEmbed(`Your custom role **${session.name}** has been created! ${discordRole}${note}`)] });
      }
    } catch (err) {
      console.error('[roleSetup] Save error:', err);
      return interaction.editReply({ embeds: [errorEmbed(`Failed to save: ${err.message}`)] });
    }
  }

  return false;
}

// ─── Message input handler ────────────────────────────────────────────────────
export async function handleRoleSetupMessage(message) {
  const { guild, author, channel } = message;
  const session = getSession(guild.id, author.id);
  if (!session || !session.awaitingInput) return false;

  const input = session.awaitingInput;
  session.awaitingInput = null;

  if (input === 'name') {
    const name = message.content.trim().slice(0, 100);
    if (!name) { await message.reply({ embeds: [errorEmbed('Name cannot be empty.')] }); return true; }
    session.name = name;
    setSession(guild.id, author.id, session);
    await message.delete().catch(() => {});
    await channel.send({ embeds: [successEmbed(`Name set to **${name}**.`)] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    await refreshSetupMessage(channel, session);
    return true;
  }

  if (input === 'colors') {
    const parts = message.content.trim().split(/\s+/);
    const hex1  = normalizeHex(parts[0]);
    const hex2  = parts[1] ? normalizeHex(parts[1]) : null;
    await message.delete().catch(() => {});

    if (!hex1) {
      await channel.send({ embeds: [errorEmbed('Invalid hex color. Use format `#FF6793` or `#FF6793 #FF8E3A`.')]})
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session);
      return true;
    }
    if (parts[1] && !hex2) {
      await channel.send({ embeds: [errorEmbed(`Second color \`${parts[1]}\` is invalid. Use a proper hex code like \`#FF8E3A\`.`)]})
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session);
      return true;
    }

    session.color1 = hex1;
    session.color2 = hex2 ?? null;
    setSession(guild.id, author.id, session);
    const colorMsg = hex2 ? `${hex1} → ${hex2}` : hex1;
    await channel.send({ embeds: [successEmbed(`Color set to **${colorMsg}**.`)] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    await refreshSetupMessage(channel, session);
    return true;
  }

  if (input === 'icon') {
    if (message.attachments.size > 0) {
      const att = message.attachments.first();
      // Discord emoji API supports PNG, JPG, GIF — not WEBP
      const allowed = ['image/png', 'image/jpeg', 'image/gif'];
      await message.delete().catch(() => {});
      if (!allowed.some(t => (att.contentType ?? '').startsWith(t))) {
        await channel.send({ embeds: [errorEmbed('Invalid file type. Please use PNG, JPG, or GIF. (WEBP is not supported for role icons.)')] })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session);
        return true;
      }
      // No size check here — Discord's emoji API will reject if too large (256 KB limit)
      try {
        // Download image then upload as a temp server emoji.
        // Using the emoji CDN URL at save time avoids Discord API image data issues.
        const buf = await downloadImage(att.proxyURL ?? att.url);
        // Delete any previous temp emoji before creating a new one
        if (session.iconTempEmojiId) {
          await guild.emojis.delete(session.iconTempEmojiId, 'Replaced by new upload').catch(() => {});
        }
        const tempEmoji = await guild.emojis.create({
          attachment: buf,
          name: 'tmpricon',
          reason: 'Temporary role icon upload',
        });
        session.iconType        = 'custom';
        session.iconValue       = `<:tmpricon:${tempEmoji.id}>`;
        session.iconUrl         = null;
        session.iconTempEmojiId = tempEmoji.id;
        setSession(guild.id, author.id, session);
        const freshG = await guild.fetch().catch(() => guild);
        const note = freshG.premiumTier >= 2 ? '' : '\n> ⚠️ Icon saved but will only apply once the server reaches boost level 2.';
        await channel.send({ embeds: [successEmbed(`✅ Image uploaded. It will be applied when you click **Save**.${note}`)] })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        await refreshSetupMessage(channel, session);
      } catch (err) {
        await channel.send({ embeds: [errorEmbed('Failed to process your image. Make sure the bot has the **Manage Emojis** permission and the server has free emoji slots.')] })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session);
      }
      return true;
    }

    // Text / emoji input — safe to delete immediately (no attachment URL to preserve)
    await message.delete().catch(() => {});
    const text = message.content.trim();
    const customMatch = text.match(/^<a?:\w+:\d+>$/);
    if (customMatch) {
      session.iconType  = 'custom';
      session.iconValue = text;
      session.iconUrl   = null;
      setSession(guild.id, author.id, session);
      const freshG2 = await guild.fetch().catch(() => guild);
      const note = freshG2.premiumTier >= 2 ? '' : '\n> ⚠️ Icon saved but will only apply once the server reaches boost level 2.';
      await channel.send({ embeds: [successEmbed(`Icon set to ${text}.${note}`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      await refreshSetupMessage(channel, session);
      return true;
    }

    const unicodeEmojiPattern = /^\p{Emoji_Presentation}|\p{Extended_Pictographic}$/u;
    if (unicodeEmojiPattern.test(text) && [...text].length <= 4) {
      session.iconType  = 'emoji';
      session.iconValue = text;
      session.iconUrl   = null;
      setSession(guild.id, author.id, session);
      const freshG3 = await guild.fetch().catch(() => guild);
      const note = freshG3.premiumTier >= 2 ? '' : '\n> ⚠️ Icon saved but will only apply once the server reaches boost level 2.';
      await channel.send({ embeds: [successEmbed(`Icon set to ${text}.${note}`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      await refreshSetupMessage(channel, session);
      return true;
    }

    await channel.send({ embeds: [errorEmbed('Please send a unicode emoji, a custom Discord emoji, or upload a PNG/JPG/WEBP image.')] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    session.awaitingInput = 'icon';
    setSession(guild.id, author.id, session);
    return true;
  }

  return false;
}

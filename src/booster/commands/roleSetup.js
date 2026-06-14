/**
 * .role setup — Persistent custom role setup wizard
 *
 * Supports: name, one or two hex colors, icon (emoji or image upload)
 * Image upload: any size/format → auto-resized to 128×128 PNG → uploaded as
 * temp server emoji → applied as role icon on Save → emoji deleted 5 min later.
 * Sessions auto-expire after 10 minutes; abandoned temp emojis are cleaned up.
 * Nothing applies to Discord until the user clicks Save.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';
import { getInsertPosition, assertBoundary } from '../utils/boundary.js';
import { normalizeHex } from '../utils/validators.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { audit } from '../utils/logger.js';
import { syncRoleColors, supportsEnhancedRoleColors } from '../services/discordRoleColorApi.js';
import { get as httpsGet } from 'https';
import { createCanvas, loadImage } from 'canvas';

// ─── Session timeout ──────────────────────────────────────────────────────────
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── In-memory session store (per user per guild) ─────────────────────────────
// Each entry: { ...sessionData, _expiryTimer: NodeJS.Timeout }
const sessions = new Map();

// ─── Reliable image downloader ────────────────────────────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    function doGet(target) {
      httpsGet(target, { headers: { 'User-Agent': 'TakinaGamesBot/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { doGet(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject)
        .setTimeout(15000, function() { this.destroy(); reject(new Error('timeout')); });
    }
    doGet(url);
  });
}

// ─── Resize any image to 128×128 PNG using canvas ────────────────────────────
async function resizeToEmojiPng(inputBuffer) {
  const img    = await loadImage(inputBuffer);
  const canvas = createCanvas(128, 128);
  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.drawImage(img, 0, 0, 128, 128);
  return canvas.toBuffer('image/png');
}

// ─── Generate color swatch PNG (280×40) for preview ──────────────────────────
function buildColorSwatchBuffer(hex1, hex2 = null) {
  const canvas = createCanvas(280, 40);
  const ctx    = canvas.getContext('2d');
  if (hex2) {
    const grad = ctx.createLinearGradient(0, 0, 280, 0);
    grad.addColorStop(0, hex1);
    grad.addColorStop(1, hex2);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = hex1;
  }
  ctx.beginPath();
  ctx.roundRect(0, 0, 280, 40, 8);
  ctx.fill();
  return canvas.toBuffer('image/png');
}

function sessionKey(guildId, userId) { return `${guildId}:${userId}`; }

// ─── Session management with auto-expiry ─────────────────────────────────────
function _clearExpiry(key) {
  const s = sessions.get(key);
  if (s?._expiryTimer) { clearTimeout(s._expiryTimer); }
}

function _scheduleExpiry(key, guild) {
  _clearExpiry(key);
  const timer = setTimeout(async () => {
    const s = sessions.get(key);
    if (!s) return;
    // Clean up any temp emoji left behind
    if (s.iconTempEmojiId) {
      await guild.emojis.delete(s.iconTempEmojiId, 'Role setup session expired — cleaning temp emoji').catch(() => {});
    }
    sessions.delete(key);
  }, SESSION_TIMEOUT_MS);
  timer.unref?.(); // don't block process exit
  const s = sessions.get(key);
  if (s) { s._expiryTimer = timer; sessions.set(key, s); }
}

export function getSession(guildId, userId) {
  const s = sessions.get(sessionKey(guildId, userId));
  if (!s) return null;
  const { _expiryTimer, ...data } = s;
  return data;
}

export function setSession(guildId, userId, data, guild) {
  const key = sessionKey(guildId, userId);
  _clearExpiry(key);
  sessions.set(key, { ...data });
  if (guild) _scheduleExpiry(key, guild);
}

export function clearSession(guildId, userId) {
  const key = sessionKey(guildId, userId);
  _clearExpiry(key);
  sessions.delete(key);
}

// ─── Schedule temp emoji deletion after save ──────────────────────────────────
function scheduleEmojiDelete(guild, emojiId, delayMs = 5 * 60 * 1000) {
  const t = setTimeout(async () => {
    try { await guild.emojis.delete(emojiId, 'Temp role icon emoji — auto-cleanup after 5 min'); } catch { /* gone */ }
  }, delayMs);
  t.unref?.();
}

// ─── Build setup embed ────────────────────────────────────────────────────────
function buildSetupEmbed(session) {
  const name   = session.name   ?? '*Not set*';
  const color1 = session.color1 ?? null;
  const color2 = session.color2 ?? null;

  let colorDisplay = '*Not set*';
  if (color1 && color2) colorDisplay = `${color1} → ${color2}`;
  else if (color1)      colorDisplay = color1;

  let iconDisplay = '*Not set*';
  if (session.iconTempEmojiId)       iconDisplay = `<:tmpricon:${session.iconTempEmojiId}>`;
  else if (session.iconType === 'emoji')  iconDisplay = session.iconValue;
  else if (session.iconType === 'custom' && !session.iconTempEmojiId) iconDisplay = session.iconValue;
  else if (session.iconType === 'image')  iconDisplay = '📷 Image (saved — re-upload to change)';

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
    .setFooter({ text: 'Session expires after 10 minutes of inactivity • Use 4️⃣ Preview then 5️⃣ Save.' })
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

  let session = getSession(guild.id, author.id);
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
      iconUrl:   null,
      iconTempEmojiId: null,
      ...(existing?.icon && !isStaleDataURI
        ? { iconType: isCustomEmoji ? 'custom' : isDiscordHosted ? 'image' : 'emoji',
            iconValue: isDiscordHosted ? 'discord_hosted' : existing.icon }
        : {}),
      awaitingInput: null,
      messageId:     null,
      channelId:     null,
    };
  }

  const embed = buildSetupEmbed(session);
  const row   = buildSetupRow();
  const sent  = await message.channel.send({ embeds: [embed], components: [row] });
  session.messageId = sent.id;
  session.channelId = sent.channelId;
  setSession(guild.id, author.id, session, guild);
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
  if (session.iconTempEmojiId)            iconLine = `<:tmpricon:${session.iconTempEmojiId}>`;
  else if (session.iconType === 'emoji')  iconLine = session.iconValue;
  else if (session.iconType === 'custom') iconLine = session.iconValue;
  else if (session.iconType === 'image')  iconLine = '📷 Image (Discord-hosted)';
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

  // Reset expiry on interaction
  setSession(guild.id, userId, session, guild);

  if (id === 'rolesetup_name') {
    session.awaitingInput = 'name';
    setSession(guild.id, userId, session, guild);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('1️⃣ Set Role Name')
        .setDescription('Send your desired role name in this channel.\n\nExample:\n```\nShadow Crown\n```')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (id === 'rolesetup_colors') {
    session.awaitingInput = 'colors';
    setSession(guild.id, userId, session, guild);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('2️⃣ Set Colors')
        .setDescription(
          'Send **one** hex color for a solid color:\n```\n#ff6793\n```\n' +
          'Or **two** hex colors for a gradient display:\n```\n#ff6793 #ff8e3a\n```\n' +
          '*The first color becomes the Discord role color. A color swatch preview will appear.*'
        )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (id === 'rolesetup_icon') {
    const freshGuild = await guild.fetch().catch(() => guild);
    const canUseIcon = freshGuild.premiumTier >= 2;
    session.awaitingInput = 'icon';
    setSession(guild.id, userId, session, guild);
    const desc = canUseIcon
      ? (
        'Send one of the following:\n\n' +
        '• **A unicode emoji** — `😀` `👑` `⭐`\n' +
        '• **A custom Discord emoji** — `<:crown:123456789>`\n' +
        '• **An image** — Upload any PNG, JPG, WEBP, or GIF (any size — auto-resized)'
      ) : (
        '⚠️ **Your server is not at boost level 2**, so role icons are disabled by Discord.\n\n' +
        'You can still set an icon — it will apply once the server reaches level 2.\n\n' +
        '• **A unicode emoji** — `😀` `👑` `⭐`\n' +
        '• **A custom Discord emoji** — `<:crown:123456789>`\n' +
        '• **An image** — Upload any PNG, JPG, WEBP, or GIF (any size — auto-resized)'
      );
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(canUseIcon ? 0x5865F2 : 0xFEE75C).setTitle('3️⃣ Set Icon').setDescription(desc)],
      flags:  MessageFlags.Ephemeral,
    });
  }

  if (id === 'rolesetup_preview') {
    return interaction.reply({ embeds: [buildPreviewEmbed(session)], flags: MessageFlags.Ephemeral });
  }

  if (id === 'rolesetup_save') {
    if (!session.name)   return interaction.reply({ embeds: [errorEmbed('Please set a **name** before saving.')],  flags: MessageFlags.Ephemeral });
    if (!session.color1) return interaction.reply({ embeds: [errorEmbed('Please set at least one **color** before saving.')], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const existing    = await BoosterRole.findOne({ guildId: guild.id, userId, active: true });
      const freshGuild  = await guild.fetch().catch(() => guild);
      const canUseIcons = freshGuild.premiumTier >= 2;

      async function resolveIconFields() {
        if (session.iconTempEmojiId) {
          try {
            const r   = await fetch(`https://cdn.discordapp.com/emojis/${session.iconTempEmojiId}.png`);
            const buf = Buffer.from(await r.arrayBuffer());
            return { icon: `data:image/png;base64,${buf.toString('base64')}`, unicodeEmoji: null };
          } catch { return {}; }
        }
        if (session.iconType === 'custom') {
          const match = session.iconValue?.match(/^<a?:\w+:(\d+)>$/);
          if (match) {
            const ext = session.iconValue.startsWith('<a:') ? 'gif' : 'png';
            try {
              const r   = await fetch(`https://cdn.discordapp.com/emojis/${match[1]}.${ext}`);
              const buf = Buffer.from(await r.arrayBuffer());
              return { icon: `data:image/${ext};base64,${buf.toString('base64')}`, unicodeEmoji: null };
            } catch { return {}; }
          }
        }
        if (session.iconType === 'emoji') return { unicodeEmoji: session.iconValue, icon: null };
        return {};
      }

      const iconFields    = await resolveIconFields();
      const iconSaved     = session.iconType && Object.keys(iconFields).length > 0;
      const iconSkipped   = iconSaved && !canUseIcons;
      const appliedFields = (iconSaved && canUseIcons) ? iconFields : {};
      const tempEmojiId   = session.iconTempEmojiId;

      if (existing) {
        const discordRole = guild.roles.cache.get(existing.roleId);
        if (!discordRole) throw new Error('Your Discord role no longer exists.');
        await assertBoundary(guild, discordRole);

        await discordRole.edit({ name: session.name, color: session.color1, ...appliedFields });
        await syncRoleColors(guild, discordRole.id, {
          primary: session.color1,
          secondary: session.color2 && supportsEnhancedRoleColors(guild) ? session.color2 : null,
        }).catch(() => {});

        existing.name = session.name;
        existing.color = session.color1;
        existing.colorSecondary = session.color2 ?? null;
        existing.iconType = tempEmojiId ? 'image' : (session.iconType ?? 'none');
        existing.icon = tempEmojiId ? 'discord_hosted' : (session.iconType === 'image' ? 'discord_hosted' : (session.iconValue ?? null));
        await existing.save();
        if (tempEmojiId) scheduleEmojiDelete(guild, tempEmojiId, 5 * 60 * 1000);
        await audit(client, guild.id, userId, 'ROLE_EDITED', { name: session.name, color: session.color2 ? `${session.color1} → ${session.color2}` : session.color1 });
        clearSession(guild.id, userId);
        const note = iconSkipped ? '\n\n> 🔒 Icon saved but not applied — your server needs boost level 2 for role icons.' : '';
        const gradientNote = session.color2 && !supportsEnhancedRoleColors(guild)
          ? '\n\n> ⚠️ Your server does not have Enhanced Role Colors, so only the primary color was applied.'
          : '';
        return interaction.editReply({ embeds: [successEmbed(`Your role **${session.name}** has been updated! ${discordRole}${note}${gradientNote}`)] });
      } else {
        const position = await getInsertPosition(guild);
        const discordRole = await guild.roles.create({ name: session.name, color: session.color1, hoist: false, mentionable: false, ...appliedFields });
        await discordRole.setPosition(position).catch(() => {});
        await syncRoleColors(guild, discordRole.id, {
          primary: session.color1,
          secondary: session.color2 && supportsEnhancedRoleColors(guild) ? session.color2 : null,
        }).catch(() => {});
        await BoosterRole.findOneAndUpdate(
          { guildId: guild.id, userId },
          { $set: {
            roleId: discordRole.id, name: session.name, color: session.color1,
            colorSecondary: session.color2 ?? null,
            iconType: tempEmojiId ? 'image' : (session.iconType ?? 'none'),
            icon:     tempEmojiId ? 'discord_hosted' : (session.iconType === 'image' ? 'discord_hosted' : (session.iconValue ?? null)),
            active: true, softDeletedAt: null,
          }},
          { upsert: true, new: true }
        );
        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(discordRole).catch(() => {});
        if (tempEmojiId) scheduleEmojiDelete(guild, tempEmojiId, 5 * 60 * 1000);
        await audit(client, guild.id, userId, 'ROLE_CREATED', { name: session.name, color: session.color2 ? `${session.color1} → ${session.color2}` : session.color1, roleId: discordRole.id });
        clearSession(guild.id, userId);
        const note = iconSkipped ? '\n\n> 🔒 Icon saved but not applied — your server needs boost level 2 for role icons.' : '';
        const gradientNote = session.color2 && !supportsEnhancedRoleColors(guild)
          ? '\n\n> ⚠️ Your server does not have Enhanced Role Colors, so only the primary color was applied.'
          : '';
        return interaction.editReply({ embeds: [successEmbed(`Your custom role **${session.name}** has been created! ${discordRole}${note}${gradientNote}`)] });
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
  // Reset session expiry on activity
  setSession(guild.id, author.id, session, guild);

  // ── Name ────────────────────────────────────────────────────────────────────
  if (input === 'name') {
    const name = message.content.trim().slice(0, 100);
    if (!name) { await message.reply({ embeds: [errorEmbed('Name cannot be empty.')] }); return true; }
    session.name = name;
    setSession(guild.id, author.id, session, guild);
    await message.delete().catch(() => {});
    await channel.send({ embeds: [successEmbed(`Name set to **${name}**.`)] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    await refreshSetupMessage(channel, session);
    return true;
  }

  // ── Colors ──────────────────────────────────────────────────────────────────
  if (input === 'colors') {
    const parts = message.content.trim().split(/\s+/);
    const hex1  = normalizeHex(parts[0]);
    const hex2  = parts[1] ? normalizeHex(parts[1]) : null;
    await message.delete().catch(() => {});

    if (!hex1) {
      await channel.send({ embeds: [errorEmbed('Invalid hex color. Use format `#FF6793` or `#FF6793 #FF8E3A`.')] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session, guild);
      return true;
    }
    if (parts[1] && !hex2) {
      await channel.send({ embeds: [errorEmbed(`Second color \`${parts[1]}\` is invalid. Use a proper hex code like \`#FF8E3A\`.`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      session.awaitingInput = 'colors';
      setSession(guild.id, author.id, session, guild);
      return true;
    }

    session.color1 = hex1;
    session.color2 = hex2 ?? null;
    setSession(guild.id, author.id, session, guild);

    // Generate and send a color swatch so the user can see what they picked
    try {
      const swatchBuf  = buildColorSwatchBuffer(hex1, hex2);
      const attachment = new AttachmentBuilder(swatchBuf, { name: 'swatch.png' });
      const colorMsg   = hex2 ? `${hex1} → ${hex2}` : hex1;
      const embed = new EmbedBuilder()
        .setColor(parseInt(hex1.replace('#', ''), 16))
        .setDescription(`✅ Color set to **${colorMsg}**`)
        .setImage('attachment://swatch.png');
      await channel.send({ embeds: [embed], files: [attachment] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 6000));
    } catch {
      // canvas failed — fall back to plain text confirmation
      const colorMsg = hex2 ? `${hex1} → ${hex2}` : hex1;
      await channel.send({ embeds: [successEmbed(`Color set to **${colorMsg}**.`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }

    await refreshSetupMessage(channel, session);
    return true;
  }

  // ── Icon ─────────────────────────────────────────────────────────────────────
  if (input === 'icon') {
    // ── Image upload ────────────────────────────────────────────────────────────
    if (message.attachments.size > 0) {
      const att = message.attachments.first();

      // Validate file type BEFORE deleting message
      const name = (att.name ?? '').toLowerCase();
      const isImage = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
                   || name.endsWith('.gif') || name.endsWith('.webp')
                   || (att.contentType ?? '').startsWith('image/');
      if (!isImage) {
        await message.delete().catch(() => {});
        await channel.send({ embeds: [errorEmbed('Please upload an image file (PNG, JPG, GIF, or WEBP).')] })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session, guild);
        return true;
      }

      const processingMsg = await channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('⏳ Uploading your image as a temp emoji...')],
      });

      try {
        // Step 1 — Download BEFORE deleting the message.
        // att.proxyURL (media.discordapp.net) returns 404 from external servers — use att.url (cdn).
        // Both have signed expiry params that can become invalid after message deletion.
        const imageBuffer = await downloadImage(att.url);

        // Step 2 — Message downloaded successfully; safe to delete now
        await message.delete().catch(() => {});

        // Step 3 — Delete stale temp emoji from a previous upload in this session
        if (session.iconTempEmojiId) {
          await guild.emojis.delete(session.iconTempEmojiId, 'Replaced by new upload').catch(() => {});
          session.iconTempEmojiId = null;
        }

        // Step 4 — Upload as a server emoji (Discord handles all resizing internally)
        const tempEmoji = await guild.emojis.create({
          attachment: imageBuffer,
          name:       'tmpricon',
          reason:     'Temp role icon — auto-deleted after save',
        });

        // Step 5 — Store the emoji ID in session; resolveIconFields uses it at Save time
        session.iconType        = 'custom';
        session.iconValue       = null;          // not displayed; emojiId is the source of truth
        session.iconTempEmojiId = tempEmoji.id;
        setSession(guild.id, author.id, session, guild);

        await processingMsg.delete().catch(() => {});
        const freshG = await guild.fetch().catch(() => guild);
        const note   = freshG.premiumTier >= 2 ? '' : '\n> ⚠️ Will only apply once the server reaches boost level 2.';
        await channel.send({
          embeds: [successEmbed(`✅ Image uploaded. Click **Save** to apply it as your role icon.${note}`)],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
        await refreshSetupMessage(channel, session);

      } catch (err) {
        await message.delete().catch(() => {});
        await processingMsg.delete().catch(() => {});
        console.error('[roleSetup] Emoji upload error:', err);
        await channel.send({
          embeds: [errorEmbed(`❌ Image upload failed: ${(err?.message ?? String(err)).slice(0, 200)}`)],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        session.awaitingInput = 'icon';
        setSession(guild.id, author.id, session, guild);
      }

      return true;
    }

    // Emoji / text input
    await message.delete().catch(() => {});
    const text = message.content.trim();
    const customMatch = text.match(/^<a?:\w+:\d+>$/);
    if (customMatch) {
      session.iconType  = 'custom';
      session.iconValue = text;
      session.iconUrl   = null;
      setSession(guild.id, author.id, session, guild);
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
      setSession(guild.id, author.id, session, guild);
      const freshG3 = await guild.fetch().catch(() => guild);
      const note = freshG3.premiumTier >= 2 ? '' : '\n> ⚠️ Icon saved but will only apply once the server reaches boost level 2.';
      await channel.send({ embeds: [successEmbed(`Icon set to ${text}.${note}`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      await refreshSetupMessage(channel, session);
      return true;
    }

    await channel.send({ embeds: [errorEmbed('Please send a unicode emoji, a custom Discord emoji, or upload a PNG/JPG/WEBP/GIF (any size).')] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    session.awaitingInput = 'icon';
    setSession(guild.id, author.id, session, guild);
    return true;
  }

  return false;
}

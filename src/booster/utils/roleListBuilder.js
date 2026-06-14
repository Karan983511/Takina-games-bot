import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';

const PAGE_SIZE = 10;

function freqToMs(freq, customMinutes) {
  switch (freq) {
    case 'hourly':  return 60 * 60 * 1000;
    case 'daily':   return 24 * 60 * 60 * 1000;
    case 'weekly':  return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    case 'custom':  return Math.max(30, customMinutes ?? 1440) * 60 * 1000;
    default:        return 24 * 60 * 60 * 1000;
  }
}

function freqLabel(freq, customMinutes) {
  switch (freq) {
    case 'hourly':  return 'Every hour';
    case 'daily':   return 'Every day';
    case 'weekly':  return 'Every week';
    case 'monthly': return 'Every month';
    case 'custom':  return `Every ${customMinutes ?? 1440} min`;
    default:        return 'Daily';
  }
}

export async function buildRoleListPayload(guild, settings, page = 0) {
  const roles = await BoosterRole.find({ guildId: guild.id, active: true })
    .sort({ createdAt: 1 }).lean();

  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(0, page), totalPages - 1);
  const slice      = roles.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Build role lines
  const lines = slice.map((r, i) => {
    const num        = safePage * PAGE_SIZE + i + 1;
    const discordRole = guild.roles.cache.get(r.roleId);
    const roleRef    = discordRole ? `<@&${r.roleId}>` : `\`${r.name}\` *(role missing)*`;
    const owner      = `<@${r.userId}>`;
    let iconBit = '';
    if ((r.iconType === 'emoji' || r.iconType === 'custom') && r.icon) iconBit = ` ${r.icon}`;
    else if (r.iconType === 'image') iconBit = ' 📷';
    const colorBit = r.color ? ` \`${r.color}\`` : '';
    return `**${num}.** ${roleRef}${iconBit}${colorBit} — ${owner}`;
  });

  // Next rotation timestamp — read from DB (set by rotationService when scheduling)
  let rotationLine;
  if (!settings?.rotation?.enabled) {
    rotationLine = '🔄 Rotation **disabled**';
  } else {
    const label  = freqLabel(settings.rotation.frequency, settings.rotation.customIntervalMinutes);
    const next   = settings.rotation.nextRotationAt;
    const tzHint = settings.rotation.timezone && settings.rotation.timezone !== 'UTC'
      ? ` (${settings.rotation.timezone})`
      : '';
    if (next) {
      const nextTs = Math.floor(new Date(next).getTime() / 1000);
      rotationLine = `🔄 **${label}** — next <t:${nextTs}:R> (<t:${nextTs}:t>)${tzHint}`;
    } else {
      rotationLine = `🔄 **${label}** — next rotation scheduled on bot restart${tzHint}`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle(`🎨 Custom Roles — ${guild.name}`)
    .setDescription(lines.length ? lines.join('\n') : '*No active custom roles yet.*')
    .addFields({ name: '\u200b', value: rotationLine })
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${roles.length} active role${roles.length !== 1 ? 's' : ''}` })
    .setTimestamp();

  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rolelist_p_${safePage - 1}`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`rolelist_p_${safePage + 1}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    ));
  }

  return { embeds: [embed], components };
}

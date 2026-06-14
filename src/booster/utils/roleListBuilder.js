import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import BoosterRole from '../models/BoosterRole.js';

const PAGE_SIZE = 10;

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

  // Build role lines — role mention + owner only
  const lines = slice.map((r, i) => {
    const num         = safePage * PAGE_SIZE + i + 1;
    const discordRole = guild.roles.cache.get(r.roleId);
    const roleRef     = discordRole ? `<@&${r.roleId}>` : `\`${r.name}\` *(missing)*`;
    const owner       = `<@${r.userId}>`;
    const sharedBit   = r.sharedWith?.length ? ` *(+${r.sharedWith.length})*` : '';
    return `\`${String(num).padStart(2, ' ')}\` ${roleRef} — ${owner}${sharedBit}`;
  });

  // Rotation info field
  let rotationValue;
  const rot = settings?.rotation;
  if (!rot?.enabled) {
    rotationValue = '🔴 Disabled';
  } else {
    const next = rot.nextRotationAt;
    if (next) {
      const nextTs = Math.floor(new Date(next).getTime() / 1000);
      rotationValue = `📅 Next shuffle <t:${nextTs}:R>`;
    } else {
      rotationValue = '📅 Next shuffle schedules on bot restart';
    }
  }

  // Stats
  const totalMembers = roles.reduce((sum, r) => sum + 1 + (r.sharedWith?.length ?? 0), 0);
  const pageInfo = totalPages > 1 ? ` · Page ${safePage + 1}/${totalPages}` : '';

  const header =
    `**${roles.length}** active role${roles.length !== 1 ? 's' : ''}` +
    ` · **${totalMembers}** member${totalMembers !== 1 ? 's' : ''} wearing them${pageInfo}`;

  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle(`🎨 Custom Roles — ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 128 }) ?? null)
    .setDescription(
      header + '\n' +
      '─'.repeat(32) + '\n' +
      (lines.length ? lines.join('\n') : '*No active custom roles yet.*')
    )
    .addFields({ name: '🔄 Rotation', value: rotationValue })
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

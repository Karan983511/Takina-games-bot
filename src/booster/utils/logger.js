import AuditLog from '../models/AuditLog.js';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const levels = { error: 0, warn: 1, info: 2, debug: 3 };

export function log(level, tag, msg) {
  if ((levels[level] ?? 2) <= (levels[LOG_LEVEL] ?? 2))
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${tag}] ${msg}`);
}

export async function audit(client, guildId, userId, action, details = {}) {
  try {
    await AuditLog.create({ guildId, userId, action, details });
    const guild = client?.guilds?.cache?.get(guildId);
    const settings = guild ? await (await import('../models/BoosterSettings.js')).default.findOne({ guildId }).lean() : null;
    if (settings?.logChannelId) {
      const ch = guild.channels.cache.get(settings.logChannelId);
      if (ch) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📋 ${action}`)
          .setDescription(Object.entries(details).map(([k, v]) => `**${k}:** ${v}`).join('\n') || 'No details.')
          .setFooter({ text: `User: ${userId}` }).setTimestamp();
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch { /* never crash on audit */ }
}

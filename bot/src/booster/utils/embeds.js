import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const errorEmbed   = (msg) => new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${msg}`);
export const successEmbed = (msg) => new EmbedBuilder().setColor(0x57F287).setDescription(`✅ ${msg}`);
export const infoEmbed    = (t, d) => new EmbedBuilder().setColor(0x5865F2).setTitle(t).setDescription(d);
export const featureDisabledEmbed = (f) => errorEmbed(`The **${f}** feature is currently disabled on this server.`);
export function confirmRow(confirmId, cancelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// ─── Color definitions ─────────────────────────────────────────────────────────
export const COLORS = [
  { id: 'red',    emoji: '🟥', label: '🟥 Red',    hex: 0xED4245 },
  { id: 'orange', emoji: '🟧', label: '🟧 Orange',  hex: 0xFFA500 },
  { id: 'yellow', emoji: '🟨', label: '🟨 Yellow',  hex: 0xFEE75C },
  { id: 'green',  emoji: '🟩', label: '🟩 Green',   hex: 0x57F287 },
  { id: 'blue',   emoji: '🟦', label: '🟦 Blue',    hex: 0x5865F2 },
  { id: 'purple', emoji: '🟪', label: '🟪 Purple',  hex: 0x9B59B6 },
];

export const COLOR_BUTTON_PREFIX = 'tg_color_';

export function buildColorPickerGame() {
  const correct = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    type: 'colorPicker',
    correct,
    correctButton: COLOR_BUTTON_PREFIX + correct.id,
    eliminatedColors: [], // IDs of wrong buttons already clicked
  };
}

export function buildColorPickerEmbed(correct) {
  return new EmbedBuilder()
    .setColor(correct.hex)  // embed color IS the answer
    .setTitle('🎨 Color Picker!')
    .setDescription(
      `**Pick a color — whoever guesses it right wins!**\n\n` +
      `Look at the color on the side of this embed and click the matching button below!\n` +
      `⏰ You have **20 seconds** — good luck!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

/**
 * Build color picker rows.
 * @param {string[]} eliminatedIds - color IDs that have been wrongly clicked and should be disabled
 * @param {boolean} allDisabled - disable all buttons (game over)
 */
export function buildColorPickerRow(eliminatedIds = [], allDisabled = false) {
  const buttons = COLORS.map(c =>
    new ButtonBuilder()
      .setCustomId(COLOR_BUTTON_PREFIX + c.id)
      .setLabel(c.label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(allDisabled || eliminatedIds.includes(c.id))
  );

  // Discord limits 5 buttons per row — split into 2 rows (3+3)
  const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 3));
  const row2 = new ActionRowBuilder().addComponents(buttons.slice(3));
  return [row1, row2];
}

export function buildColorPickerWinEmbed(winner, correct) {
  return new EmbedBuilder()
    .setColor(correct.hex)
    .setTitle('🎨 Correct Color!')
    .setDescription(
      `${winner} picked the right color!\n` +
      `It was **${correct.label}** ${correct.emoji}`
    )
    .setFooter({ text: 'Takina Games' });
}

export function buildColorPickerTimeoutEmbed(correct) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(`Nobody picked the right color! It was **${correct.label}** ${correct.emoji}`)
    .setFooter({ text: 'Takina Games' });
}

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const BUTTON_RACE_ID = 'tg_buttonrace_click';

export function buildButtonRaceGame() {
  return { type: 'buttonRace', waiting: true };
}

export function buildButtonRaceEmbed(waiting = false) {
  if (waiting) {
    return new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('⚡ Button Race!')
      .setDescription(
        '**Get ready...**\n\n' +
        'The button will turn **GREEN** soon!\n' +
        'Don\'t click yet! ⛔'
      )
      .setFooter({ text: 'Takina Games' })
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('⚡ GO GO GO!')
    .setDescription(
      '**CLICK THE BUTTON NOW!**\n\n' +
      'First click wins! 🏆'
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildButtonRaceRow(waiting = false, disabled = false) {
  if (waiting) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BUTTON_RACE_ID)
        .setLabel('⛔ WAIT...')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_RACE_ID)
      .setLabel('⚡ CLICK ME FIRST!')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export function buildButtonRaceWinEmbed(winner) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('⚡ Winner!')
    .setDescription(`${winner} clicked it first! 🏆`)
    .setFooter({ text: 'Takina Games' });
}

export function buildButtonRaceTimeoutEmbed() {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Nobody Clicked!')
    .setDescription('The button timed out. No winner this round!')
    .setFooter({ text: 'Takina Games' });
}

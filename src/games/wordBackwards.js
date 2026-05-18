import { EmbedBuilder } from 'discord.js';

// ─── Word pool (common, recognizable, 4-9 letters, no palindromes, no duplicates) ─
const WORDS = [
  'python','discord','gaming','purple','crystal','orange','silver','golden',
  'dragon','castle','forest','planet','rocket','flower','bridge','bottle',
  'butter','coffee','camera','laptop','screen','garden','window','candle',
  'shadow','mirror','breeze','stream','flight','winter','summer','spring',
  'island','monkey','spider','turtle','rabbit','parrot','falcon','salmon',
  'blizzard','thunder','whisper','freedom','rainbow','diamond','lantern',
  'blanket','station','library','kitchen','balloon','dolphin','penguin',
  'starfish','compass','captain','warrior','sunrise','horizon','mystery',
  'chapter','journey','harvest','ancient','eternal','legend','temple',
  'treasure','village','phantom','tornado','volcano','eclipse',
  'triumph','gravity','silence','flutter','blossom','sparrow',
  'venture','cluster','fragile','radiant','elegant','vibrant',
  'destiny','harmony','kingdom','pattern','quantum','reflect',
  'shimmer','stellar','texture','ultraviolet','version','whistle',
  'xenon','yellow','zephyr','absolute','balance','capture',
  'develop','element','factory','genuine','history','imagine',
  'justice','limited','monitor','network',
];

function reverseWord(word) {
  return word.split('').reverse().join('');
}

export function buildWordBackwardsGame() {
  const word     = WORDS[Math.floor(Math.random() * WORDS.length)];
  const reversed = reverseWord(word);
  return { type: 'wordBackwards', word, answer: reversed };
}

export function buildWordBackwardsEmbed(word, reversed) {
  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('🔤 Word Backwards!')
    .setDescription(
      `**Type this word BACKWARDS in chat to win!**\n\n` +
      `# \`${word}\`\n\n` +
      `First person to type it backwards wins!\n` +
      `⏰ You have **30 seconds**!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildWordBackwardsTimeoutEmbed(word, reversed) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(`Nobody got it! The answer was \`${reversed}\` (backwards of **${word}**)`)
    .setFooter({ text: 'Takina Games' });
}

export function buildWordBackwardsWinEmbed(winner, word, reversed) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎉 Correct!')
    .setDescription(
      `${winner} typed it backwards first!\n` +
      `**${word}** → \`${reversed}\``
    )
    .setFooter({ text: 'Takina Games' });
}

export function checkWordBackwardsAnswer(game, message) {
  return message.content.trim().toLowerCase() === game.answer.toLowerCase();
}

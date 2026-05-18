import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const WYR_A        = 'tg_wyr_a';
export const WYR_B        = 'tg_wyr_b';
export const WYR_VOTERS   = 'tg_wyr_voters';

// ─── Question bank ─────────────────────────────────────────────────────────────
const QUESTIONS = [
  ['Have the ability to fly', 'Be invisible whenever you want'],
  ['Always be 10 minutes late', 'Always be 20 minutes early'],
  ['Lose all your money', 'Lose all your memories'],
  ['Only speak in rhymes', 'Only speak in questions'],
  ['Never be able to use a phone again', 'Never be able to watch a movie again'],
  ['Be famous but hated', 'Be unknown but loved'],
  ['Always know when someone is lying', 'Always get away with lying'],
  ['Have x10 your current intelligence', 'Have x10 your current happiness'],
  ['Live in virtual reality 24/7', 'Never be able to use the internet'],
  ['Be able to talk to animals', 'Be able to speak all human languages'],
  ['Have unlimited pizza for life', 'Have unlimited money but can only eat plain rice'],
  ['Fight 100 duck-sized horses', 'Fight 1 horse-sized duck'],
  ['Always be hot', 'Always be cold'],
  ['Never eat your favorite food again', 'Only eat your favorite food forever'],
  ['Read minds but everyone knows you can', 'Read minds but you can never tell anyone'],
  ['Go to space once', 'Go to the deep ocean once'],
  ['Be the most attractive person on earth', 'Be the smartest person on earth'],
  ['Be a famous musician', 'Be a famous gamer streamer'],
  ['Have anime superpowers in real life', 'Live inside your favorite anime'],
  ['Win every argument', 'Never lose a friend'],
  ['Never sleep again (no fatigue)', 'Sleep 20 hours a day feeling amazing'],
  ['Be immortal but age normally', 'Live until 150 but stay young looking'],
  ['Have your search history public', 'Have your text messages public'],
  ['Skip the boring parts of life', 'Replay your best memories'],
  ['Have a pause button for life', 'Have a rewind button for life'],
  ['Discover a new planet', 'Discover a cure for cancer'],
  ['Be the villain in a movie', 'Be a side character in a movie'],
  ['Have 1000 best friends', 'Have 1 perfect soulmate'],
  ['Only use Discord forever', 'Never use Discord again'],
  ['Be permanently cringe', 'Be permanently boring'],
  ['Have super speed', 'Have super strength'],
  ['Always tell the truth', 'Always have to lie'],
  ['Live in the past (100 years ago)', 'Live in the future (100 years from now)'],
  ['Have a photographic memory', 'Be able to forget anything you want'],
  ['Only eat sweet food forever', 'Only eat savory food forever'],
  ['Be able to breathe underwater', 'Be able to survive in space'],
  ['Relive your childhood', 'Skip ahead to retirement'],
  ['Be a cat', 'Be a dog'],
  ['Control time', 'Control weather'],
  ['Never feel pain', 'Never feel fear'],
  ['Know how you die', 'Know when you die'],
  ['Have every video game ever made', 'Have every book ever written'],
  ['Be always overdressed', 'Always be underdressed'],
  ['Only watch one TV show forever', 'Never watch TV again'],
  ['Lose your sense of taste', 'Lose your sense of smell'],
  ['Have to sing everything you say', 'Have to dance everywhere you go'],
  ['Be a master chef', 'Be a master musician'],
  ['Live without music', 'Live without movies'],
  ['Have free flights forever', 'Have free food forever'],
  ['Always win at card games', 'Always win at video games'],
];

// ─── Game builder ──────────────────────────────────────────────────────────────

export function buildWouldYouRatherGame() {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  return {
    type: 'wouldYouRather',
    optionA: q[0],
    optionB: q[1],
    votesA: [],
    votesB: [],
  };
}

function progressBar(pct, fill = '█', empty = '░') {
  const filled = Math.round(pct / 10);
  return fill.repeat(filled) + empty.repeat(10 - filled);
}

function buildVoterList(ids) {
  if (!ids.length) return '*No votes*';
  const mentions = ids.map(id => `<@${id}>`);
  let list = mentions.join(', ');
  if (list.length > 950) {
    list = mentions.slice(0, 15).join(', ') + ` …and ${mentions.length - 15} more`;
  }
  return list;
}

export function buildWyrEmbed(game, concluded = false) {
  const totalVotes = game.votesA.length + game.votesB.length;
  const pA = totalVotes ? Math.round((game.votesA.length / totalVotes) * 100) : 50;
  const pB = totalVotes ? Math.round((game.votesB.length / totalVotes) * 100) : 50;

  if (!concluded) {
    const aCount = game.votesA.length;
    const bCount = game.votesB.length;
    const desc = `**Would you rather…**\n\n` +
      `🅰️ **${game.optionA}**\n` +
      (aCount ? `${progressBar(pA)} **${pA}%** (${aCount})\n\n` : `\n`) +
      `**OR**\n\n` +
      `🅱️ **${game.optionB}**\n` +
      (bCount ? `${progressBar(pB)} **${pB}%** (${bCount})\n\n` : `\n`) +
      `Vote below! ⏰ **20 seconds** to vote!`;

    return new EmbedBuilder()
      .setColor(0xEB459E)
      .setTitle('🤔 Would You Rather?')
      .setDescription(desc)
      .setFooter({ text: 'Takina Games' })
      .setTimestamp();
  }

  // ── Concluded: show percentages + who voted for what ───────────────────────
  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('📊 Would You Rather — Results')
    .setDescription(`**Final Results after ${totalVotes} vote(s):**`)
    .addFields(
      {
        name: `🅰️ ${game.optionA}`,
        value: `${progressBar(pA)} **${pA}%** (${game.votesA.length})\n${buildVoterList(game.votesA)}`,
        inline: false,
      },
      {
        name: `🅱️ ${game.optionB}`,
        value: `${progressBar(pB)} **${pB}%** (${game.votesB.length})\n${buildVoterList(game.votesB)}`,
        inline: false,
      },
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildWyrVotersEmbed(game) {
  return new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('👥 Current Voters')
    .addFields(
      {
        name: `🅰️ ${game.optionA}`,
        value: buildVoterList(game.votesA),
        inline: false,
      },
      {
        name: `🅱️ ${game.optionB}`,
        value: buildVoterList(game.votesB),
        inline: false,
      },
    )
    .setFooter({ text: 'Takina Games' });
}

export function buildWyrRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(WYR_A)
      .setLabel('🅰️ Option A')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(WYR_B)
      .setLabel('🅱️ Option B')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(WYR_VOTERS)
      .setLabel('👥 See Voters')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

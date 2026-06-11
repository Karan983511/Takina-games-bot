import { EmbedBuilder } from 'discord.js';

export const FLAGS = [
  { emoji: '🇯🇵', name: 'Japan',          answers: ['japan'] },
  { emoji: '🇺🇸', name: 'United States',  answers: ['united states', 'usa', 'us', 'america', 'united states of america'] },
  { emoji: '🇬🇧', name: 'United Kingdom', answers: ['united kingdom', 'uk', 'britain', 'great britain', 'england'] },
  { emoji: '🇫🇷', name: 'France',         answers: ['france'] },
  { emoji: '🇩🇪', name: 'Germany',        answers: ['germany'] },
  { emoji: '🇧🇷', name: 'Brazil',         answers: ['brazil'] },
  { emoji: '🇨🇦', name: 'Canada',         answers: ['canada'] },
  { emoji: '🇦🇺', name: 'Australia',      answers: ['australia'] },
  { emoji: '🇮🇳', name: 'India',          answers: ['india'] },
  { emoji: '🇨🇳', name: 'China',          answers: ['china'] },
  { emoji: '🇷🇺', name: 'Russia',         answers: ['russia'] },
  { emoji: '🇰🇷', name: 'South Korea',    answers: ['south korea', 'korea'] },
  { emoji: '🇲🇽', name: 'Mexico',         answers: ['mexico'] },
  { emoji: '🇮🇹', name: 'Italy',          answers: ['italy'] },
  { emoji: '🇪🇸', name: 'Spain',          answers: ['spain'] },
  { emoji: '🇳🇱', name: 'Netherlands',    answers: ['netherlands', 'holland'] },
  { emoji: '🇵🇭', name: 'Philippines',    answers: ['philippines', 'ph'] },
  { emoji: '🇮🇩', name: 'Indonesia',      answers: ['indonesia'] },
  { emoji: '🇵🇰', name: 'Pakistan',       answers: ['pakistan'] },
  { emoji: '🇳🇬', name: 'Nigeria',        answers: ['nigeria'] },
  { emoji: '🇿🇦', name: 'South Africa',   answers: ['south africa'] },
  { emoji: '🇦🇷', name: 'Argentina',      answers: ['argentina'] },
  { emoji: '🇹🇷', name: 'Turkey',         answers: ['turkey', 'türkiye'] },
  { emoji: '🇸🇦', name: 'Saudi Arabia',   answers: ['saudi arabia', 'saudi'] },
  { emoji: '🇹🇭', name: 'Thailand',       answers: ['thailand'] },
  { emoji: '🇻🇳', name: 'Vietnam',        answers: ['vietnam', 'viet nam'] },
  { emoji: '🇵🇹', name: 'Portugal',       answers: ['portugal'] },
  { emoji: '🇵🇱', name: 'Poland',         answers: ['poland'] },
  { emoji: '🇸🇪', name: 'Sweden',         answers: ['sweden'] },
  { emoji: '🇳🇴', name: 'Norway',         answers: ['norway'] },
  { emoji: '🇩🇰', name: 'Denmark',        answers: ['denmark'] },
  { emoji: '🇫🇮', name: 'Finland',        answers: ['finland'] },
  { emoji: '🇨🇭', name: 'Switzerland',    answers: ['switzerland'] },
  { emoji: '🇧🇪', name: 'Belgium',        answers: ['belgium'] },
  { emoji: '🇦🇹', name: 'Austria',        answers: ['austria'] },
  { emoji: '🇬🇷', name: 'Greece',         answers: ['greece'] },
  { emoji: '🇪🇬', name: 'Egypt',          answers: ['egypt'] },
  { emoji: '🇮🇱', name: 'Israel',         answers: ['israel'] },
  { emoji: '🇯🇲', name: 'Jamaica',        answers: ['jamaica'] },
  { emoji: '🇲🇾', name: 'Malaysia',       answers: ['malaysia'] },
  { emoji: '🇳🇿', name: 'New Zealand',    answers: ['new zealand', 'nz'] },
  { emoji: '🇮🇷', name: 'Iran',           answers: ['iran'] },
  { emoji: '🇺🇦', name: 'Ukraine',        answers: ['ukraine'] },
  { emoji: '🇵🇪', name: 'Peru',           answers: ['peru'] },
  { emoji: '🇨🇴', name: 'Colombia',       answers: ['colombia'] },
  { emoji: '🇨🇱', name: 'Chile',          answers: ['chile'] },
  { emoji: '🇰🇪', name: 'Kenya',          answers: ['kenya'] },
  { emoji: '🇬🇭', name: 'Ghana',          answers: ['ghana'] },
  { emoji: '🇪🇹', name: 'Ethiopia',       answers: ['ethiopia'] },
  { emoji: '🇲🇦', name: 'Morocco',        answers: ['morocco'] },
  { emoji: '🇸🇬', name: 'Singapore',      answers: ['singapore'] },
  { emoji: '🇭🇰', name: 'Hong Kong',      answers: ['hong kong'] },
  { emoji: '🇷🇴', name: 'Romania',        answers: ['romania'] },
  { emoji: '🇭🇺', name: 'Hungary',        answers: ['hungary'] },
  { emoji: '🇨🇿', name: 'Czech Republic', answers: ['czech republic', 'czechia', 'czech'] },
  { emoji: '🇸🇰', name: 'Slovakia',       answers: ['slovakia'] },
  { emoji: '🇧🇬', name: 'Bulgaria',       answers: ['bulgaria'] },
  { emoji: '🇭🇷', name: 'Croatia',        answers: ['croatia'] },
  { emoji: '🇸🇮', name: 'Slovenia',       answers: ['slovenia'] },
  { emoji: '🇷🇸', name: 'Serbia',         answers: ['serbia'] },
  { emoji: '🇮🇶', name: 'Iraq',           answers: ['iraq'] },
  { emoji: '🇦🇪', name: 'UAE',            answers: ['uae', 'united arab emirates', 'emirates'] },
  { emoji: '🇶🇦', name: 'Qatar',          answers: ['qatar'] },
  { emoji: '🇰🇼', name: 'Kuwait',         answers: ['kuwait'] },
  { emoji: '🇧🇩', name: 'Bangladesh',     answers: ['bangladesh'] },
  { emoji: '🇱🇰', name: 'Sri Lanka',      answers: ['sri lanka'] },
  { emoji: '🇲🇲', name: 'Myanmar',        answers: ['myanmar', 'burma'] },
  { emoji: '🇰🇭', name: 'Cambodia',       answers: ['cambodia'] },
  { emoji: '🇱🇦', name: 'Laos',           answers: ['laos'] },
  { emoji: '🇳🇵', name: 'Nepal',          answers: ['nepal'] },
  { emoji: '🇦🇫', name: 'Afghanistan',    answers: ['afghanistan'] },
  { emoji: '🇲🇳', name: 'Mongolia',       answers: ['mongolia'] },
  { emoji: '🇰🇿', name: 'Kazakhstan',     answers: ['kazakhstan'] },
  { emoji: '🇺🇿', name: 'Uzbekistan',     answers: ['uzbekistan'] },
  { emoji: '🇹🇲', name: 'Turkmenistan',   answers: ['turkmenistan'] },
  { emoji: '🇬🇪', name: 'Georgia',        answers: ['georgia'] },
  { emoji: '🇦🇲', name: 'Armenia',        answers: ['armenia'] },
  { emoji: '🇦🇿', name: 'Azerbaijan',     answers: ['azerbaijan'] },
  { emoji: '🇧🇾', name: 'Belarus',        answers: ['belarus'] },
  { emoji: '🇱🇹', name: 'Lithuania',      answers: ['lithuania'] },
  { emoji: '🇱🇻', name: 'Latvia',         answers: ['latvia'] },
  { emoji: '🇪🇪', name: 'Estonia',        answers: ['estonia'] },
  { emoji: '🇫🇯', name: 'Fiji',           answers: ['fiji'] },
  { emoji: '🇵🇬', name: 'Papua New Guinea', answers: ['papua new guinea', 'png'] },
  { emoji: '🇨🇺', name: 'Cuba',           answers: ['cuba'] },
  { emoji: '🇩🇴', name: 'Dominican Republic', answers: ['dominican republic', 'dominican'] },
  { emoji: '🇭🇹', name: 'Haiti',          answers: ['haiti'] },
  { emoji: '🇵🇦', name: 'Panama',         answers: ['panama'] },
  { emoji: '🇨🇷', name: 'Costa Rica',     answers: ['costa rica'] },
  { emoji: '🇬🇹', name: 'Guatemala',      answers: ['guatemala'] },
  { emoji: '🇭🇳', name: 'Honduras',       answers: ['honduras'] },
  { emoji: '🇸🇻', name: 'El Salvador',    answers: ['el salvador'] },
  { emoji: '🇳🇮', name: 'Nicaragua',      answers: ['nicaragua'] },
  { emoji: '🇧🇴', name: 'Bolivia',        answers: ['bolivia'] },
  { emoji: '🇻🇪', name: 'Venezuela',      answers: ['venezuela'] },
  { emoji: '🇪🇨', name: 'Ecuador',        answers: ['ecuador'] },
  { emoji: '🇺🇾', name: 'Uruguay',        answers: ['uruguay'] },
  { emoji: '🇵🇾', name: 'Paraguay',       answers: ['paraguay'] },
  { emoji: '🇸🇳', name: 'Senegal',        answers: ['senegal'] },
  { emoji: '🇨🇮', name: "Côte d'Ivoire",  answers: ["cote d'ivoire", 'ivory coast'] },
  { emoji: '🇨🇲', name: 'Cameroon',       answers: ['cameroon'] },
  { emoji: '🇿🇲', name: 'Zambia',         answers: ['zambia'] },
  { emoji: '🇿🇼', name: 'Zimbabwe',       answers: ['zimbabwe'] },
  { emoji: '🇹🇿', name: 'Tanzania',       answers: ['tanzania'] },
  { emoji: '🇺🇬', name: 'Uganda',         answers: ['uganda'] },
  { emoji: '🇷🇼', name: 'Rwanda',         answers: ['rwanda'] },
  { emoji: '🇸🇩', name: 'Sudan',          answers: ['sudan'] },
  { emoji: '🇸🇸', name: 'South Sudan',    answers: ['south sudan'] },
  { emoji: '🇩🇿', name: 'Algeria',        answers: ['algeria'] },
  { emoji: '🇹🇳', name: 'Tunisia',        answers: ['tunisia'] },
  { emoji: '🇱🇾', name: 'Libya',          answers: ['libya'] },
  { emoji: '🇮🇪', name: 'Ireland',        answers: ['ireland'] },
  { emoji: '🇮🇸', name: 'Iceland',        answers: ['iceland'] },
  { emoji: '🇱🇺', name: 'Luxembourg',     answers: ['luxembourg'] },
  { emoji: '🇲🇹', name: 'Malta',          answers: ['malta'] },
  { emoji: '🇨🇾', name: 'Cyprus',         answers: ['cyprus'] },
  { emoji: '🇦🇱', name: 'Albania',        answers: ['albania'] },
  { emoji: '🇲🇰', name: 'North Macedonia', answers: ['north macedonia', 'macedonia'] },
  { emoji: '🇧🇦', name: 'Bosnia and Herzegovina', answers: ['bosnia', 'bosnia and herzegovina'] },
  { emoji: '🇲🇪', name: 'Montenegro',     answers: ['montenegro'] },
  { emoji: '🇽🇰', name: 'Kosovo',         answers: ['kosovo'] },
  { emoji: '🇲🇩', name: 'Moldova',        answers: ['moldova'] },
  { emoji: '🇲🇨', name: 'Monaco',         answers: ['monaco'] },
  { emoji: '🇱🇮', name: 'Liechtenstein',  answers: ['liechtenstein'] },
  { emoji: '🇸🇲', name: 'San Marino',     answers: ['san marino'] },
  { emoji: '🇦🇩', name: 'Andorra',        answers: ['andorra'] },
];

export function buildFlagGame() {
  const country = FLAGS[Math.floor(Math.random() * FLAGS.length)];
  return { type: 'flag', country, answers: country.answers };
}

export function buildFlagEmbed(country) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏳️  Flag Guess!')
    .setDescription(
      `**Which country does this flag belong to?**\n\n` +
      `# ${country.emoji}\n\n` +
      `Type your answer in chat! First correct answer wins.\n` +
      `⏰ You have **30 seconds**!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildFlagTimeoutEmbed(country) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(`Nobody got it! The answer was **${country.name}** ${country.emoji}`)
    .setFooter({ text: 'Takina Games' });
}

export function buildFlagWinEmbed(winner, country) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎉 Correct!')
    .setDescription(
      `${winner} got it right!\n` +
      `The answer was **${country.name}** ${country.emoji}`
    )
    .setFooter({ text: 'Takina Games' });
}

export function checkFlagAnswer(game, message) {
  const answer = message.content.trim().toLowerCase();

  return game.answers.some(
    a => a.toLowerCase() === answer
  );
}

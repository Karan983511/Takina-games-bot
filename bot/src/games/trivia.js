import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const TRIVIA_PREFIX = 'tg_trivia_';

// ─── Question bank ──────────────────────────────────────────────
// Format: { question, correct, wrong: [a, b, c] }

const QUESTIONS = [
  // Science
  { question: 'What is the chemical symbol for Gold?',                    correct: 'Au',           wrong: ['Go', 'Gd', 'Ag'] },
  { question: 'How many bones are in the adult human body?',              correct: '206',          wrong: ['198', '214', '220'] },
  { question: 'What planet is known as the Red Planet?',                  correct: 'Mars',         wrong: ['Venus', 'Jupiter', 'Saturn'] },
  { question: 'What is the speed of light (km/s)?',                       correct: '299,792',      wrong: ['199,792', '399,792', '150,000'] },
  { question: 'What gas do plants absorb from the atmosphere?',           correct: 'CO₂',          wrong: ['O₂', 'N₂', 'H₂'] },
  { question: 'How many chromosomes do humans have?',                     correct: '46',           wrong: ['23', '48', '52'] },
  { question: 'What is the powerhouse of the cell?',                      correct: 'Mitochondria', wrong: ['Nucleus', 'Ribosome', 'Vacuole'] },
  { question: 'What is the most abundant gas in Earth\'s atmosphere?',    correct: 'Nitrogen',     wrong: ['Oxygen', 'Carbon Dioxide', 'Argon'] },
  { question: 'Which planet has the most moons?',                         correct: 'Saturn',       wrong: ['Jupiter', 'Neptune', 'Uranus'] },
  { question: 'What is the atomic number of Carbon?',                     correct: '6',            wrong: ['8', '12', '14'] },
  { question: 'What is the chemical formula for water?',                  correct: 'H₂O',          wrong: ['H₂O₂', 'HO', 'H₃O'] },
  { question: 'Which planet is closest to the Sun?',                      correct: 'Mercury',      wrong: ['Venus', 'Mars', 'Earth'] },
  { question: 'How many chambers does the human heart have?',             correct: '4',            wrong: ['2', '3', '6'] },
  { question: 'What is the hardest bone in the human body?',              correct: 'Jaw bone',     wrong: ['Femur', 'Skull', 'Spine'] },
  { question: 'What force keeps planets in orbit around the Sun?',        correct: 'Gravity',      wrong: ['Magnetism', 'Friction', 'Centripetal force'] },
  { question: 'What is the boiling point of water (°C)?',                 correct: '100',          wrong: ['90', '110', '212'] },
  { question: 'How many planets are in our solar system?',                correct: '8',            wrong: ['7', '9', '10'] },
  { question: 'What element does "O" represent on the periodic table?',   correct: 'Oxygen',       wrong: ['Osmium', 'Oganesson', 'Oregonium'] },
  { question: 'What organ produces insulin?',                             correct: 'Pancreas',     wrong: ['Liver', 'Kidney', 'Spleen'] },
  { question: 'How long does it take light to travel from the Sun to Earth?', correct: '8 minutes', wrong: ['1 minute', '1 hour', '1 second'] },

  // Geography
  { question: 'What is the capital city of Japan?',                       correct: 'Tokyo',        wrong: ['Osaka', 'Kyoto', 'Hiroshima'] },
  { question: 'Which is the largest continent by area?',                  correct: 'Asia',         wrong: ['Africa', 'North America', 'Europe'] },
  { question: 'What is the longest river in the world?',                  correct: 'Nile',         wrong: ['Amazon', 'Yangtze', 'Mississippi'] },
  { question: 'Which country has the most natural lakes?',                correct: 'Canada',       wrong: ['Russia', 'Finland', 'USA'] },
  { question: 'What is the capital of Australia?',                        correct: 'Canberra',     wrong: ['Sydney', 'Melbourne', 'Brisbane'] },
  { question: 'Which country has the most pyramids?',                     correct: 'Sudan',        wrong: ['Egypt', 'Mexico', 'Peru'] },
  { question: 'What ocean is the largest?',                               correct: 'Pacific',      wrong: ['Atlantic', 'Indian', 'Arctic'] },
  { question: 'What is the smallest country in the world?',               correct: 'Vatican City', wrong: ['Monaco', 'Nauru', 'San Marino'] },
  { question: 'Which country has the longest coastline?',                 correct: 'Canada',       wrong: ['Russia', 'Norway', 'Indonesia'] },
  { question: 'What is the tallest mountain in the world?',               correct: 'Everest',      wrong: ['K2', 'Kangchenjunga', 'Lhotse'] },
  { question: 'What is the capital of Brazil?',                           correct: 'Brasília',     wrong: ['Rio de Janeiro', 'São Paulo', 'Salvador'] },
  { question: 'Which African country has the most population?',           correct: 'Nigeria',      wrong: ['Ethiopia', 'Egypt', 'South Africa'] },
  { question: 'What is the currency of Japan?',                           correct: 'Yen',          wrong: ['Won', 'Yuan', 'Baht'] },
  { question: 'In which country is the Amazon rainforest mostly located?',correct: 'Brazil',       wrong: ['Peru', 'Colombia', 'Venezuela'] },
  { question: 'What is the largest desert in the world?',                 correct: 'Antarctic Desert', wrong: ['Sahara', 'Gobi', 'Arabian'] },
  { question: 'Which country has the most spoken languages?',             correct: 'Papua New Guinea', wrong: ['India', 'Cameroon', 'Indonesia'] },
  { question: 'What is the capital of South Korea?',                      correct: 'Seoul',        wrong: ['Busan', 'Incheon', 'Daegu'] },

  // History
  { question: 'In what year did World War II end?',                       correct: '1945',         wrong: ['1944', '1946', '1943'] },
  { question: 'Who was the first man to walk on the Moon?',               correct: 'Neil Armstrong', wrong: ['Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'] },
  { question: 'The Great Wall of China was built primarily to defend against which group?', correct: 'Mongols', wrong: ['Romans', 'Huns', 'Japanese'] },
  { question: 'In which year did the Titanic sink?',                      correct: '1912',         wrong: ['1910', '1915', '1908'] },
  { question: 'Which civilization built the Colosseum?',                  correct: 'Romans',       wrong: ['Greeks', 'Egyptians', 'Persians'] },
  { question: 'Who was the first President of the United States?',        correct: 'George Washington', wrong: ['Thomas Jefferson', 'Abraham Lincoln', 'John Adams'] },
  { question: 'In what year did the Berlin Wall fall?',                   correct: '1989',         wrong: ['1985', '1991', '1987'] },
  { question: 'Which empire was the largest in history by area?',         correct: 'British Empire', wrong: ['Mongol Empire', 'Roman Empire', 'Ottoman Empire'] },
  { question: 'Who invented the telephone?',                              correct: 'Alexander Graham Bell', wrong: ['Thomas Edison', 'Nikola Tesla', 'Samuel Morse'] },
  { question: 'What year did the French Revolution begin?',               correct: '1789',         wrong: ['1776', '1799', '1815'] },
  { question: 'Who wrote the Declaration of Independence?',               correct: 'Thomas Jefferson', wrong: ['Benjamin Franklin', 'John Adams', 'George Washington'] },

  // Gaming
  { question: 'What game popularized the Battle Royale genre on PC?',     correct: 'PUBG',         wrong: ['Fortnite', 'Warzone', 'Apex Legends'] },
  { question: 'In Minecraft, what material gives the best armor?',        correct: 'Netherite',    wrong: ['Diamond', 'Iron', 'Gold'] },
  { question: 'Which game has the most sold copies ever?',                correct: 'Minecraft',    wrong: ['GTA V', 'Tetris', 'Wii Sports'] },
  { question: 'What is the main currency in The Legend of Zelda?',        correct: 'Rupees',       wrong: ['Coins', 'Gold', 'Gems'] },
  { question: 'In Among Us, what color was most voted for as sus?',       correct: 'Red',          wrong: ['Purple', 'Black', 'White'] },
  { question: 'What year was Fortnite Battle Royale released?',           correct: '2017',         wrong: ['2016', '2018', '2019'] },
  { question: 'Which company developed "League of Legends"?',             correct: 'Riot Games',   wrong: ['Blizzard', 'Valve', 'Epic Games'] },
  { question: 'What is the name of the main character in "The Witcher" game?', correct: 'Geralt', wrong: ['Ciri', 'Yennefer', 'Vernon Roche'] },
  { question: 'In what game do you play as Master Chief?',                correct: 'Halo',         wrong: ['Call of Duty', 'Doom', 'Titanfall'] },
  { question: 'What year was Roblox first released?',                     correct: '2006',         wrong: ['2004', '2008', '2010'] },
  { question: 'What is the best-selling gaming console of all time?',     correct: 'PlayStation 2', wrong: ['Nintendo DS', 'Game Boy', 'Wii'] },
  { question: 'Which game has the tagline "War. War never changes."?',    correct: 'Fallout',      wrong: ['Doom', 'Metro', 'Halo'] },
  { question: 'In Pokémon, what type is effective against Water?',        correct: 'Electric',     wrong: ['Fire', 'Grass', 'Ice'] },
  { question: 'What is the max level in the original Diablo game?',       correct: '50',           wrong: ['99', '100', '70'] },

  // Pop Culture / Anime
  { question: 'What anime is Eren Yeager from?',                          correct: 'Attack on Titan', wrong: ['Demon Slayer', 'Naruto', 'Bleach'] },
  { question: 'Who voiced SpongeBob SquarePants?',                        correct: 'Tom Kenny',    wrong: ['Bill Fagerbakke', 'Rodger Bumpass', 'Clancy Brown'] },
  { question: 'What streaming service produces "Stranger Things"?',       correct: 'Netflix',      wrong: ['Hulu', 'Amazon', 'Disney+'] },
  { question: 'In Naruto, what village is Naruto from?',                  correct: 'Leaf Village', wrong: ['Sand Village', 'Mist Village', 'Cloud Village'] },
  { question: 'What is the name of Ash\'s first Pokémon?',               correct: 'Pikachu',      wrong: ['Squirtle', 'Charmander', 'Bulbasaur'] },
  { question: 'Which anime character says "Plus Ultra!"?',                correct: 'Deku',         wrong: ['Goku', 'Naruto', 'Luffy'] },
  { question: 'What is the most streamed song of all time on Spotify?',   correct: 'Blinding Lights', wrong: ['Shape of You', 'Despacito', 'Dance Monkey'] },
  { question: 'How many seasons does "Breaking Bad" have?',               correct: '5',            wrong: ['4', '6', '7'] },
  { question: 'What is the home city of Batman?',                         correct: 'Gotham City',  wrong: ['Metropolis', 'Central City', 'Star City'] },
  { question: 'What is the name of Harry Potter\'s owl?',                 correct: 'Hedwig',       wrong: ['Fawkes', 'Errol', 'Pigwidgeon'] },
  { question: 'Which anime has characters named Gon and Killua?',         correct: 'Hunter x Hunter', wrong: ['Bleach', 'Dragon Ball', 'Fairy Tail'] },
  { question: 'In "One Piece", what is the name of Luffy\'s crew?',      correct: 'Straw Hat Pirates', wrong: ['Red Hair Pirates', 'Whitebeard Pirates', 'Blackbeard Pirates'] },
  { question: 'What movie franchise features the character "Iron Man"?',  correct: 'Marvel',       wrong: ['DC', 'Star Wars', 'Transformers'] },
  { question: 'What color is Pikachu?',                                   correct: 'Yellow',       wrong: ['Red', 'Orange', 'Brown'] },
  { question: 'Which show features Walter White?',                        correct: 'Breaking Bad', wrong: ['Better Call Saul', 'Ozark', 'Narcos'] },

  // Technology
  { question: 'Who founded Microsoft?',                                   correct: 'Bill Gates',   wrong: ['Steve Jobs', 'Elon Musk', 'Jeff Bezos'] },
  { question: 'What does "CPU" stand for?',                               correct: 'Central Processing Unit', wrong: ['Computer Processing Unit', 'Core Power Unit', 'Central Power Unit'] },
  { question: 'In what year was the iPhone first released?',              correct: '2007',         wrong: ['2005', '2008', '2010'] },
  { question: 'What does "HTTP" stand for?',                              correct: 'HyperText Transfer Protocol', wrong: ['High Transfer Text Protocol', 'HyperText Transmission Protocol', 'Host Transfer Text Protocol'] },
  { question: 'Which company created Discord?',                           correct: 'Discord Inc.', wrong: ['Microsoft', 'Twitch', 'Slack'] },
  { question: 'What language is primarily used for web styling?',         correct: 'CSS',          wrong: ['HTML', 'JavaScript', 'Python'] },
  { question: 'What does "RAM" stand for?',                               correct: 'Random Access Memory', wrong: ['Read Access Memory', 'Rapid Access Module', 'Remote Access Memory'] },
  { question: 'Which company makes the Snapdragon processor?',            correct: 'Qualcomm',     wrong: ['Intel', 'AMD', 'NVIDIA'] },
  { question: 'What programming language was created by Guido van Rossum?', correct: 'Python',    wrong: ['Ruby', 'Perl', 'Java'] },
  { question: 'What does "AI" stand for?',                                correct: 'Artificial Intelligence', wrong: ['Automated Intelligence', 'Advanced Interface', 'Automatic Interaction'] },
  { question: 'Which company owns YouTube?',                              correct: 'Google',       wrong: ['Meta', 'Microsoft', 'Amazon'] },
  { question: 'What is the name of Apple\'s virtual assistant?',          correct: 'Siri',         wrong: ['Alexa', 'Cortana', 'Bixby'] },

  // Math / Logic
  { question: 'What is the next prime number after 17?',                  correct: '19',           wrong: ['18', '21', '23'] },
  { question: 'What is 15% of 200?',                                      correct: '30',           wrong: ['25', '35', '20'] },
  { question: 'What shape has 8 sides?',                                  correct: 'Octagon',      wrong: ['Heptagon', 'Hexagon', 'Nonagon'] },
  { question: 'What is the value of π rounded to 2 decimal places?',      correct: '3.14',         wrong: ['3.12', '3.16', '3.41'] },
  { question: 'How many sides does a dodecagon have?',                    correct: '12',           wrong: ['10', '8', '14'] },
  { question: 'What is the square root of 144?',                          correct: '12',           wrong: ['11', '13', '14'] },
  { question: 'How many degrees are in a triangle?',                      correct: '180',          wrong: ['90', '270', '360'] },
  { question: 'What is 7 × 8?',                                           correct: '56',           wrong: ['48', '54', '64'] },
  { question: 'What is the Roman numeral for 50?',                        correct: 'L',            wrong: ['C', 'V', 'X'] },
  { question: 'What is 2 to the power of 10?',                            correct: '1024',         wrong: ['512', '2048', '1000'] },

  // Food & Nature
  { question: 'What fruit is known as the "king of fruits" in Southeast Asia?', correct: 'Durian', wrong: ['Mango', 'Jackfruit', 'Rambutan'] },
  { question: 'How many hearts does an octopus have?',                    correct: '3',            wrong: ['1', '2', '4'] },
  { question: 'What is the hardest natural substance on Earth?',          correct: 'Diamond',      wrong: ['Ruby', 'Quartz', 'Steel'] },
  { question: 'Which animal has the longest lifespan?',                   correct: 'Greenland Shark', wrong: ['Tortoise', 'Elephant', 'Parrot'] },
  { question: 'What color is a mirror?',                                  correct: 'Green',        wrong: ['Silver', 'White', 'Grey'] },
  { question: 'How many legs does a spider have?',                        correct: '8',            wrong: ['6', '10', '12'] },
  { question: 'What is the fastest land animal?',                         correct: 'Cheetah',      wrong: ['Lion', 'Greyhound', 'Ostrich'] },
  { question: 'Which fruit has its seeds on the outside?',                correct: 'Strawberry',   wrong: ['Raspberry', 'Blueberry', 'Banana'] },
  { question: 'What type of animal is a Komodo Dragon?',                  correct: 'Lizard',       wrong: ['Snake', 'Crocodile', 'Turtle'] },
  { question: 'How many eyes does a bee have?',                           correct: '5',            wrong: ['2', '4', '6'] },
];

// ─── Game builder ──────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildTriviaGame() {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const options = shuffle([q.correct, ...q.wrong]);
  const correctIndex = options.indexOf(q.correct);
  return {
    type: 'trivia',
    question: q.question,
    options,
    correctIndex,
    correctButton: TRIVIA_PREFIX + correctIndex,
  };
}

export function buildTriviaEmbed(question, options) {
  const labels = ['A', 'B', 'C', 'D'];
  const desc = options.map((opt, i) => `**${labels[i]}.** ${opt}`).join('\n');
  return new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🧠 Trivia Time!')
    .setDescription(
      `**${question}**\n\n${desc}\n\n` +
      `Click the correct answer button!\n⏰ You have **25 seconds**!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildTriviaRow(options, disabled = false) {
  const labels = ['A', 'B', 'C', 'D'];
  const buttons = options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(TRIVIA_PREFIX + i)
      .setLabel(`${labels[i]}. ${opt.length > 40 ? opt.slice(0, 37) + '...' : opt}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
  return new ActionRowBuilder().addComponents(buttons);
}

export function buildTriviaWinEmbed(winner, question, correct) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🧠 Correct!')
    .setDescription(
      `${winner} got it right!\n` +
      `**Q:** ${question}\n**A:** ${correct}`
    )
    .setFooter({ text: 'Takina Games' });
}

export function buildTriviaTimeoutEmbed(question, correct) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(`Nobody got it!\n**Q:** ${question}\n**A:** ${correct}`)
    .setFooter({ text: 'Takina Games' });
}

export function buildTriviaWrongEmbed() {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setDescription('❌ Wrong answer!')
    .setFooter({ text: 'Takina Games' });
}

import { EmbedBuilder } from 'discord.js';

// ─── Problem generators ────────────────────────────────────────────────────────

function addition() {
  const big = Math.random() < 0.4;
  const a = big ? Math.floor(Math.random() * 9000) + 1000 : Math.floor(Math.random() * 900) + 100;
  const b = big ? Math.floor(Math.random() * 9000) + 1000 : Math.floor(Math.random() * 900) + 100;
  return { question: `${a} + ${b}`, answer: a + b };
}

function subtraction() {
  const big = Math.random() < 0.4;
  const a = big ? Math.floor(Math.random() * 5000) + 2000 : Math.floor(Math.random() * 900) + 200;
  const b = Math.floor(Math.random() * (a - 1)) + 1;
  return { question: `${a} - ${b}`, answer: a - b };
}

function multiplication() {
  const type = Math.floor(Math.random() * 3);
  if (type === 0) {
    // small × small
    const a = Math.floor(Math.random() * 12) + 2;
    const b = Math.floor(Math.random() * 12) + 2;
    return { question: `${a} × ${b}`, answer: a * b };
  } else if (type === 1) {
    // medium × small
    const a = Math.floor(Math.random() * 80) + 20;
    const b = Math.floor(Math.random() * 9) + 2;
    return { question: `${a} × ${b}`, answer: a * b };
  } else {
    // larger range
    const a = Math.floor(Math.random() * 20) + 11;
    const b = Math.floor(Math.random() * 20) + 11;
    return { question: `${a} × ${b}`, answer: a * b };
  }
}

function division() {
  const b = Math.floor(Math.random() * 11) + 2; // divisor 2-12
  const answer = Math.floor(Math.random() * 50) + 5;
  const a = b * answer;
  return { question: `${a} ÷ ${b}`, answer };
}

function squareRoot() {
  const answer = Math.floor(Math.random() * 25) + 2; // 2-26
  const a = answer * answer;
  return { question: `√${a}`, answer };
}

function power() {
  const type = Math.floor(Math.random() * 3);
  if (type === 0) {
    const base = Math.floor(Math.random() * 8) + 2;
    const exp  = 2;
    return { question: `${base}²`, answer: Math.pow(base, exp) };
  } else if (type === 1) {
    const base = Math.floor(Math.random() * 6) + 2;
    const exp  = 3;
    return { question: `${base}³`, answer: Math.pow(base, exp) };
  } else {
    const base = Math.floor(Math.random() * 5) + 2;
    const exp  = Math.floor(Math.random() * 2) + 2;
    return { question: `${base}^${exp}`, answer: Math.pow(base, exp) };
  }
}

function percentage() {
  const pcts = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80];
  const pct  = pcts[Math.floor(Math.random() * pcts.length)];
  const base = Math.floor(Math.random() * 19 + 1) * 20; // multiples of 20, 20-400
  const answer = Math.round((pct / 100) * base);
  return { question: `${pct}% of ${base}`, answer };
}

function negatives() {
  const a = Math.floor(Math.random() * 50) + 10;
  const b = Math.floor(Math.random() * 100) + a + 1;
  return { question: `${a} - ${b}`, answer: a - b };
}

const GENERATORS = [
  { fn: addition,      weight: 3 },
  { fn: subtraction,   weight: 3 },
  { fn: multiplication,weight: 3 },
  { fn: division,      weight: 2 },
  { fn: squareRoot,    weight: 1 },
  { fn: power,         weight: 2 },
  { fn: percentage,    weight: 2 },
  { fn: negatives,     weight: 1 },
];

// weighted random pick
function pickGenerator() {
  const total = GENERATORS.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of GENERATORS) {
    r -= g.weight;
    if (r <= 0) return g.fn;
  }
  return GENERATORS[0].fn;
}

// ─── Game builder ──────────────────────────────────────────────────────────────

export function buildMathGame() {
  const { question, answer } = pickGenerator()();
  return {
    type: 'math',
    question,
    answer,
    answers: [String(answer)],
  };
}

export function buildMathEmbed(question) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🧮 Math Quiz!')
    .setDescription(
      `**Solve the equation and type the answer in chat!**\n\n` +
      `# \`${question} = ?\`\n\n` +
      `First correct answer wins!\n` +
      `⏰ You have **30 seconds**!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildMathTimeoutEmbed(question, answer) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(`Nobody solved it! **${question} = ${answer}**`)
    .setFooter({ text: 'Takina Games' });
}

export function buildMathWinEmbed(winner, question, answer) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🧮 Correct!')
    .setDescription(
      `${winner} solved it first!\n` +
      `**${question} = ${answer}**`
    )
    .setFooter({ text: 'Takina Games' });
}

export function checkMathAnswer(game, message) {
  const input = message.content.trim();
  return input === String(game.answer);
}

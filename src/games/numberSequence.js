import { EmbedBuilder } from 'discord.js';

// ─── Pattern generators ──────────────────────────────────────────────

function addConstant() {
  const start = Math.floor(Math.random() * 20) + 1;
  const step  = Math.floor(Math.random() * 9) + 2; // 2–10
  const seq   = [];
  for (let i = 0; i < 5; i++) seq.push(start + i * step);
  return { seq, answer: start + 5 * step, hint: `Add ${step}` };
}

function subtractConstant() {
  const start = Math.floor(Math.random() * 30) + 50;
  const step  = Math.floor(Math.random() * 8) + 2;
  const seq   = [];
  for (let i = 0; i < 5; i++) seq.push(start - i * step);
  return { seq, answer: start - 5 * step, hint: `Subtract ${step}` };
}

function multiply() {
  const start = Math.floor(Math.random() * 5) + 2;
  const ratio = Math.floor(Math.random() * 3) + 2; // 2–4
  const seq   = [];
  for (let i = 0; i < 4; i++) seq.push(start * Math.pow(ratio, i));
  return { seq, answer: start * Math.pow(ratio, 4), hint: `Multiply by ${ratio}` };
}

function squares() {
  const start = Math.floor(Math.random() * 5) + 1;
  const seq   = [];
  for (let i = 0; i < 5; i++) seq.push(Math.pow(start + i, 2));
  return { seq, answer: Math.pow(start + 5, 2), hint: 'Squares' };
}

function fibonacciLike() {
  const a = Math.floor(Math.random() * 5) + 1;
  const b = Math.floor(Math.random() * 5) + a + 1;
  const seq = [a, b];
  for (let i = 2; i < 5; i++) seq.push(seq[i - 1] + seq[i - 2]);
  return { seq, answer: seq[3] + seq[4], hint: 'Add previous two' };
}

function primes() {
  const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  const start = Math.floor(Math.random() * (PRIMES.length - 6));
  const seq   = PRIMES.slice(start, start + 5);
  return { seq, answer: PRIMES[start + 5], hint: 'Prime numbers' };
}

function oddNumbers() {
  const start = Math.floor(Math.random() * 20) * 2 + 1;
  const seq   = [];
  for (let i = 0; i < 5; i++) seq.push(start + i * 2);
  return { seq, answer: start + 10, hint: 'Odd numbers' };
}

function evenNumbers() {
  const start = Math.floor(Math.random() * 20) * 2 + 2;
  const seq   = [];
  for (let i = 0; i < 5; i++) seq.push(start + i * 2);
  return { seq, answer: start + 10, hint: 'Even numbers' };
}

function alternating() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 20;
  const seq = [];
  for (let i = 0; i < 5; i++) seq.push(i % 2 === 0 ? a + i : b + i);
  return { seq, answer: a + 5, hint: 'Alternating' };
}

// ─── Medium generators ───────────────────────────────────────────────

// Step increases by 1 each time: e.g. 3-5-8-12-17 (+2,+3,+4,+5 → next +6)
function addIncreasing() {
  const start    = Math.floor(Math.random() * 15) + 1;
  const firstAdd = Math.floor(Math.random() * 3) + 2; // 2–4
  const seq      = [start];
  for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] + firstAdd + i);
  const answer = seq[seq.length - 1] + firstAdd + 4;
  return { seq, answer, hint: 'Step increases by 1' };
}

// Step decreases by 1 each time: e.g. 50-45-41-38-36 (-5,-4,-3,-2 → next -1)
function subtractDecreasing() {
  const firstSub = Math.floor(Math.random() * 4) + 4; // 4–7
  const start    = Math.floor(Math.random() * 20) + 30 + firstSub * 5;
  const seq      = [start];
  for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] - (firstSub - i));
  const answer = seq[seq.length - 1] - (firstSub - 4);
  return { seq, answer, hint: 'Step decreases by 1' };
}

// Alternates between two fixed steps: e.g. +3,+7,+3,+7,...
function alternatingSteps() {
  const start = Math.floor(Math.random() * 10) + 1;
  const stepA = Math.floor(Math.random() * 4) + 2;  // 2–5
  const stepB = Math.floor(Math.random() * 5) + stepA + 2; // always bigger
  const seq   = [start];
  for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] + (i % 2 === 0 ? stepA : stepB));
  const answer = seq[seq.length - 1] + (4 % 2 === 0 ? stepA : stepB);
  return { seq, answer, hint: `Alternating +${stepA}/+${stepB}` };
}

// Multiply then add: e.g. ×2+3 pattern: 5-13-29-61-125
function multiplyPlusConstant() {
  const start = Math.floor(Math.random() * 5) + 2;
  const ratio = 2;
  const add   = Math.floor(Math.random() * 4) + 1; // 1–4
  const seq   = [start];
  for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] * ratio + add);
  const answer = seq[seq.length - 1] * ratio + add;
  return { seq, answer, hint: `×${ratio} then +${add}` };
}

// Powers of a small base: 3^1,3^2,3^3... or 4^1,4^2...
function powers() {
  const base  = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
  const start = Math.floor(Math.random() * 2) + 1; // exponent starts at 1 or 2
  const seq   = [];
  for (let i = 0; i < 4; i++) seq.push(Math.pow(base, start + i));
  return { seq, answer: Math.pow(base, start + 4), hint: `Powers of ${base}` };
}

const GENERATORS = [
  addConstant,
  subtractConstant,
  multiply,
  squares,
  fibonacciLike,
  primes,
  oddNumbers,
  evenNumbers,
  alternating,
  addIncreasing,
  subtractDecreasing,
  alternatingSteps,
  multiplyPlusConstant,
  powers,
];

// ─── Game builder ──────────────────────────────────────────────

export function buildNumberSequenceGame() {
  const gen = GENERATORS[Math.floor(Math.random() * GENERATORS.length)];
  const { seq, answer, hint } = gen();

  // Full sequence including the answer at the end
  const fullSeq = [...seq, answer];

  // 40% chance to hide a middle term instead of the last one
  // Middle = any index from 1 up to (length - 2), so there are visible numbers on both sides
  let missingIndex;
  if (Math.random() < 0.2 && fullSeq.length >= 4) {
    missingIndex = Math.floor(Math.random() * (fullSeq.length - 2)) + 1;
  } else {
    missingIndex = fullSeq.length - 1; // last (original behaviour)
  }

  return {
    type: 'numberSequence',
    fullSeq,
    answer: fullSeq[missingIndex],
    missingIndex,
    hint,
    answers: [String(fullSeq[missingIndex])],
  };
}

// Build a display string like "3-5-?-17-23" or "3-5-8-12-?"
function buildDisplay(fullSeq, missingIndex) {
  return fullSeq
    .map((n, i) => (i === missingIndex ? '**?**' : String(n)))
    .join(' - ');
}

export function buildNumberSequenceEmbed(game) {
  const display = buildDisplay(game.fullSeq, game.missingIndex);
  const isMid   = game.missingIndex < game.fullSeq.length - 1;
  return new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle('🔢 Number Sequence!')
    .setDescription(
      `**What ${isMid ? 'is the missing number' : 'comes next'}?**\n\n` +
      `${display}\n\n` +
      `Type the missing number in chat to win!\n` +
      `⏰ You have **30 seconds**!`
    )
    .setFooter({ text: 'Takina Games' })
    .setTimestamp();
}

export function buildNumberSequenceTimeoutEmbed(game) {
  const full = game.fullSeq.map((n, i) => i === game.missingIndex ? `**${n}**` : String(n)).join(' - ');
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⏰ Time\'s Up!')
    .setDescription(
      `Nobody got it! The answer was **${game.answer}**\n` +
      `Sequence: ${full}`
    )
    .setFooter({ text: 'Takina Games' });
}

export function buildNumberSequenceWinEmbed(winner, game) {
  const full = game.fullSeq.map((n, i) => i === game.missingIndex ? `**${n}**` : String(n)).join(' - ');
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Pattern Solved!')
    .setDescription(
      `**Winner:** ${winner}\n\n` +
      `**Sequence:** ${full}`
    )
    .setFooter({ text: 'Takina Games' });
}

export function checkNumberSequenceAnswer(game, message) {
  const input = message.content.trim();
  return input === String(game.answer);
}

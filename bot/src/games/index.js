import { EmbedBuilder } from 'discord.js';
import {
  buildFlagGame, buildFlagEmbed, buildFlagTimeoutEmbed, buildFlagWinEmbed, checkFlagAnswer,
} from './flagGuess.js';
import {
  buildWordBackwardsGame, buildWordBackwardsEmbed, buildWordBackwardsTimeoutEmbed,
  buildWordBackwardsWinEmbed, checkWordBackwardsAnswer,
} from './wordBackwards.js';
import {
  buildButtonRaceGame, buildButtonRaceEmbed, buildButtonRaceRow,
  buildButtonRaceWinEmbed, buildButtonRaceTimeoutEmbed, BUTTON_RACE_ID,
} from './buttonRace.js';
import {
  buildColorPickerGame, buildColorPickerEmbed, buildColorPickerRow,
  buildColorPickerWinEmbed, buildColorPickerTimeoutEmbed,
  COLOR_BUTTON_PREFIX,
} from './colorPicker.js';
import {
  buildMathGame, buildMathEmbed, buildMathTimeoutEmbed, buildMathWinEmbed, checkMathAnswer,
} from './mathQuiz.js';
import {
  buildTriviaGame, buildTriviaEmbed, buildTriviaRow, buildTriviaWinEmbed,
  buildTriviaTimeoutEmbed, buildTriviaWrongEmbed, TRIVIA_PREFIX,
} from './trivia.js';
import {
  buildWouldYouRatherGame, buildWyrEmbed, buildWyrRow, buildWyrVotersEmbed,
  WYR_A, WYR_B, WYR_VOTERS,
} from './wouldYouRather.js';
import {
  buildNumberSequenceGame, buildNumberSequenceEmbed, buildNumberSequenceTimeoutEmbed,
  buildNumberSequenceWinEmbed, checkNumberSequenceAnswer,
} from './numberSequence.js';

/**
 * Replace any hardcoded "XX seconds" in an embed description with the
 * configured timeout value so the displayed timer always matches reality.
 */
function patchTimeout(embed, seconds) {
  if (!embed?.data?.description) return embed;
  const s = seconds ?? 30;
  const display = s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m ${s % 60}s`;
  embed.data.description = embed.data.description.replace(
    /\*\*\d+\s*seconds?\*\*/gi,
    `**${display}**`
  );
  return embed;
}

const TEXT_GAMES = {
  flag: {
    build:   () => buildFlagGame(),
    embed:   (g) => patchTimeout(buildFlagEmbed(g.country), g.timeoutSeconds),
    timeout: (g) => buildFlagTimeoutEmbed(g.country),
    win:     (winner, g) => buildFlagWinEmbed(winner, g.country),
    check:   checkFlagAnswer,
    maxAttempts: 2,
  },
  wordBackwards: {
    build:   () => buildWordBackwardsGame(),
    embed:   (g) => patchTimeout(buildWordBackwardsEmbed(g.word, g.answer), g.timeoutSeconds),
    timeout: (g) => buildWordBackwardsTimeoutEmbed(g.word, g.answer),
    win:     (winner, g) => buildWordBackwardsWinEmbed(winner, g.word, g.answer),
    check:   checkWordBackwardsAnswer,
    maxAttempts: 1,
  },
  math: {
    build:   () => buildMathGame(),
    embed:   (g) => patchTimeout(buildMathEmbed(g.question), g.timeoutSeconds),
    timeout: (g) => buildMathTimeoutEmbed(g.question, g.answer),
    win:     (winner, g) => buildMathWinEmbed(winner, g.question, g.answer),
    check:   checkMathAnswer,
    validateGuess: (g, msg) => /\d/.test(msg.content.trim()),
    maxAttempts: 2,
  },
  numberSequence: {
    build:   () => buildNumberSequenceGame(),
    embed:   (g) => patchTimeout(buildNumberSequenceEmbed(g), g.timeoutSeconds),
    timeout: (g) => buildNumberSequenceTimeoutEmbed(g),
    win:     (winner, g) => buildNumberSequenceWinEmbed(winner, g),
    check:   checkNumberSequenceAnswer,
    validateGuess: (g, msg) => /^-?\d+$/.test(msg.content.trim()),
    maxAttempts: 2,
  },
};

const BUTTON_GAMES = {
  buttonRace: {
    build:        () => buildButtonRaceGame(),
    embed:        (g) => patchTimeout(buildButtonRaceEmbed(g.waiting), g.timeoutSeconds),
    rows:         (g) => [buildButtonRaceRow(g.waiting, false)],
    disabledRows: (g) => [buildButtonRaceRow(false, true)],
    timeout:      ()  => buildButtonRaceTimeoutEmbed(),
    win:          (winner) => buildButtonRaceWinEmbed(winner),
    isCorrect:    (game, customId) => !game.waiting && customId === BUTTON_RACE_ID,
    isWrong:      (game, customId) => game.waiting && customId === BUTTON_RACE_ID,
    wrongEmbed:   ()  => new EmbedBuilder().setColor(0xED4245).setDescription('⛔ Too early! You clicked before it turned green!'),
  },
  colorPicker: {
    build:        () => buildColorPickerGame(),
    embed:        (g) => patchTimeout(buildColorPickerEmbed(g.correct), g.timeoutSeconds),
    rows:         (g) => buildColorPickerRow(g.eliminatedColors ?? []),
    disabledRows: ()  => buildColorPickerRow([], true),
    timeout:      (g) => buildColorPickerTimeoutEmbed(g.correct),
    win:          (winner, g) => buildColorPickerWinEmbed(winner, g.correct),
    isCorrect:    (game, customId) => customId === game.correctButton,
    isWrong:      (game, customId) => customId.startsWith(COLOR_BUTTON_PREFIX) && customId !== game.correctButton,
    // Called on wrong click — eliminates that button and signals message update needed
    onWrongClick: (game, customId) => {
      const colorId = customId.replace(COLOR_BUTTON_PREFIX, '');
      if (!game.eliminatedColors.includes(colorId)) {
        game.eliminatedColors.push(colorId);
      }
    },
    maxAttempts:  1, // per user — each player can only click once
  },
  trivia: {
    build:        () => buildTriviaGame(),
    embed:        (g) => patchTimeout(buildTriviaEmbed(g.question, g.options), g.timeoutSeconds),
    rows:         (g) => [buildTriviaRow(g.options)],
    disabledRows: (g) => [buildTriviaRow(g.options, true)],
    timeout:      (g) => buildTriviaTimeoutEmbed(g.question, g.options[g.correctIndex]),
    win:          (winner, g) => buildTriviaWinEmbed(winner, g.question, g.options[g.correctIndex]),
    wrongEmbed:   ()  => buildTriviaWrongEmbed(),
    rightEmbed:   ()  => new EmbedBuilder().setColor(0x57F287).setDescription('✅ Correct!'),
    isCorrect:    (game, customId) => customId === game.correctButton,
    isWrong:      (game, customId) => customId.startsWith(TRIVIA_PREFIX) && customId !== game.correctButton,
    maxAttempts:  1,
  },
  wouldYouRather: {
    build:        () => buildWouldYouRatherGame(),
    embed:        (g, concluded) => patchTimeout(buildWyrEmbed(g, concluded), g.timeoutSeconds),
    rows:         ()  => [buildWyrRow()],
    disabledRows: ()  => [buildWyrRow(true)],
    timeout:      (g) => buildWyrEmbed(g, true),
    win:          null,
    isWyr:        true,
    isVote:       (customId) => customId === WYR_A || customId === WYR_B,
    isVoterCheck: (customId) => customId === WYR_VOTERS,
    votersEmbed:  (game) => buildWyrVotersEmbed(game),
    voteFor:      (game, userId, customId) => {
      game.votesA = game.votesA.filter(id => id !== userId);
      game.votesB = game.votesB.filter(id => id !== userId);
      if (customId === WYR_A) game.votesA.push(userId);
      else                    game.votesB.push(userId);
    },
  },
};

export const ALL_GAMES = { ...TEXT_GAMES, ...BUTTON_GAMES };
export { TEXT_GAMES, BUTTON_GAMES };

export function pickRandomGame(enabled) {
  if (!enabled.length) return null;
  return enabled[Math.floor(Math.random() * enabled.length)];
}

export function shouldGiveRole() {
  return Math.random() < 0.2; // 20% = 1 in 5
}

/**
 * Pick a random role from the pool and grant it to the winner.
 * Returns the granted roleId string, or null if nothing was granted.
 */
export async function grantRewardRole(guild, userId, roleIds, configService) {
  if (!roleIds || !roleIds.length) return null;

  // Filter out roles the user already owns so they never get duplicates
  const userOwned = configService ? configService.getUserCollection(guild.id, userId).owned : [];
  const available = roleIds.filter(id => !userOwned.includes(id));
  const pool = available.length ? available : roleIds; // fallback to all if they own everything

  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  for (const roleId of shuffled) {
    try {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      // Add to collection and auto-equip it
      if (configService) {
        configService.addOwnedRole(guild.id, userId, roleId);
        configService.equipRole(guild.id, userId, roleId);
      }
      // Assign Discord role immediately so user sees it right away
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.add(roleId).catch(() => {});
      return roleId;
    } catch {
      continue;
    }
  }

  return null;
}

import { ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { ALL_GAMES, TEXT_GAMES, BUTTON_GAMES, pickRandomGame, shouldGiveRole, grantRewardRole } from '../games/index.js';

const GAME_END_COOLDOWN  = 5 * 60 * 1000;  // 5 minutes between games
const ACTIVITY_WINDOW_MS = 30 * 60 * 1000; // channel "active" window

export class GameScheduler {
  constructor(client) {
    this.client      = client;
    this.timers      = new Map(); // guildId -> setTimeout handle
    this.active      = new Map(); // guildId -> active game state
    this.cooldowns   = new Map(); // guildId -> cooldown timeout handle
    this.msgRefQueue = new Map(); // guildId -> [{ channelId, messageId, replyIds }, ...]
  }

  startGuild(guildId) {
    this.stopGuild(guildId);
    if (!this.cooldowns.has(guildId)) {
      this._scheduleNext(guildId);
      console.log(`[GameScheduler] Started for guild ${guildId}`);
    } else {
      console.log(`[GameScheduler] Guild ${guildId} is in cooldown.`);
    }
  }

  stopGuild(guildId) {
    const t = this.timers.get(guildId);
    if (t) { clearTimeout(t); this.timers.delete(guildId); }
    const c = this.cooldowns.get(guildId);
    if (c) { clearTimeout(c); this.cooldowns.delete(guildId); }
  }

  startAll() {
    for (const guild of this.client.guilds.cache.values()) {
      const cfg = this.client.config.get(guild.id);
      if (cfg.enabled) this.startGuild(guild.id);
    }
  }

  _scheduleNext(guildId) {
    const cfg = this.client.config.get(guildId);
    if (!cfg.enabled) return;

    const minMs = cfg.minInterval * 60 * 1000;
    const maxMs = cfg.maxInterval * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    console.log(`[GameScheduler] Guild ${guildId}: next game in ${Math.round(delay / 60000)} min`);

    const timer = setTimeout(async () => {
      if (this.active.has(guildId)) {
        this.timers.set(guildId, setTimeout(() => this._scheduleNext(guildId), 30_000));
        return;
      }
      await this._runGame(guildId);
    }, delay);

    this.timers.set(guildId, timer);
  }

  async _pickChannel(guild, cfg) {
    const now = Date.now();

    if (cfg.allowedChannels.length > 0) {
      const valid = [];
      for (const chId of cfg.allowedChannels) {
        const ch = guild.channels.cache.get(chId);
        if (ch && ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
          valid.push(ch);
        }
      }
      if (!valid.length) return null;
      return valid[Math.floor(Math.random() * valid.length)];
    }

    const active = [];
    const all    = [];

    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText) continue;
      if (!ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])) continue;
      all.push(ch);
      const lastMsg = this.client.recentActivity.get(ch.id);
      if (lastMsg && now - lastMsg < ACTIVITY_WINDOW_MS) active.push(ch);
    }

    const pool = active.length ? active : all;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async _runGame(guildId) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    // ── Delete oldest game message once 2 newer ones have appeared ───────────
    const queue = this.msgRefQueue.get(guildId) ?? [];
    if (queue.length >= 2) {
      const oldest = queue.shift();
      // Fire-and-forget: don't await deletion so the new game sends immediately
      (async () => {
        try {
          const prevCh = guild.channels.cache.get(oldest.channelId);
          if (prevCh) {
            const prevMsg = await prevCh.messages.fetch(oldest.messageId).catch(() => null);
            if (prevMsg) await prevMsg.delete().catch(() => {});
            // Also delete any tracked reply messages (WYR results, etc.)
            for (const rid of (oldest.replyIds ?? [])) {
              const rMsg = await prevCh.messages.fetch(rid).catch(() => null);
              if (rMsg) await rMsg.delete().catch(() => {});
            }
          }
        } catch { /* ignore — message already deleted or missing */ }
      })();
    }

    const cfg     = this.client.config.get(guildId);
    const enabled = this.client.config.enabledGames(guildId);
    if (!enabled.length) return;

    const channel = await this._pickChannel(guild, cfg);
    if (!channel) return;

    const gameKey = pickRandomGame(enabled);
    const def     = ALL_GAMES[gameKey];
    if (!def) return;

    const game  = def.build();
    game.timeoutSeconds = cfg.gameTimeoutSeconds ?? 30;
    const embed = def.embed(game);

    let msg;
    try {
      const isButtonGame = gameKey in BUTTON_GAMES;
      msg = await channel.send(
        isButtonGame
          ? { embeds: [embed], components: def.rows(game) }
          : { embeds: [embed] }
      );
    } catch (err) {
      console.error(`[GameScheduler] Failed to send game to ${channel.id}:`, err.message);
      return;
    }

    queue.push({ channelId: channel.id, messageId: msg.id, replyIds: [] });
    this.msgRefQueue.set(guildId, queue);

    const timeoutMs = (cfg.gameTimeoutSeconds ?? 30) * 1000;

    const state = {
      gameKey,
      game,
      guildId,
      channelId:     channel.id,
      messageId:     msg.id,
      ended:         false,
      replyMessageId: null,
    };
    this.active.set(guildId, state);

    const timeoutHandle = setTimeout(() => this._endGame(guildId, null), timeoutMs);
    state.timeoutHandle = timeoutHandle;

    // ── Button Race: 5-second "red light" phase, then turn green ──────────────
    if (gameKey === 'buttonRace') {
      state.goHandle = setTimeout(async () => {
        if (state.ended) return;
        game.waiting = false;
        try {
          const original = await channel.messages.fetch(msg.id).catch(() => null);
          if (original) {
            const defRace = ALL_GAMES[gameKey];
            await original.edit({
              embeds: [defRace.embed(game)],
              components: defRace.rows(game),
            });
          }
        } catch { /* ignore */ }
      }, 5000);
    }
  }

  async _endGame(guildId, winner) {
    const state = this.active.get(guildId);
    if (!state || state.ended) return;
    state.ended = true;
    clearTimeout(state.timeoutHandle);
    if (state.goHandle) clearTimeout(state.goHandle);
    this.active.delete(guildId);

    const guild   = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(state.channelId);
    if (!channel) return;

    const def = ALL_GAMES[state.gameKey];

    // Start cooldown → schedule next game after it expires
    if (this.cooldowns.has(guildId)) clearTimeout(this.cooldowns.get(guildId));
    this.cooldowns.set(guildId, setTimeout(() => {
      this.cooldowns.delete(guildId);
      this._scheduleNext(guildId);
    }, GAME_END_COOLDOWN));

    // ── Would You Rather — show results + send separate results message ───────
    if (def.isWyr) {
      try {
        const original = await channel.messages.fetch(state.messageId).catch(() => null);
        if (original) {
          await original.edit({ embeds: [def.embed(state.game, true)], components: def.disabledRows() });
        }
        // Send a separate results message and track it for later deletion
        const resultsMsg = await channel.send({ embeds: [def.embed(state.game, true)] }).catch(() => null);
        if (resultsMsg) {
          const queue = this.msgRefQueue.get(guildId) ?? [];
          const ref = queue.find(r => r.messageId === state.messageId);
          if (ref) ref.replyIds.push(resultsMsg.id);
        }
      } catch { /* ignore */ }
      return;
    }

    // ── Win ──────────────────────────────────────────────────────────────────
    if (winner) {
      const winEmbed    = def.win(winner.toString(), state.game);
      let grantedRoleId = null;

      if (shouldGiveRole()) {
        const cfg = this.client.config.get(guildId);
        if (cfg.rewardRoleIds?.length) {
          grantedRoleId = await grantRewardRole(guild, winner.id, cfg.rewardRoleIds, this.client.config);
        }
      }
      if (grantedRoleId) {
        const role = guild.roles.cache.get(grantedRoleId);
        try {
          const roleNotify = new EmbedBuilder()
            .setColor(role?.color ?? 0x57F287)
            .setDescription(`${winner} received the <@&${grantedRoleId}> role!`);
          await channel.send({ embeds: [roleNotify] });
        } catch { /* ignore */ }
      }

      try {
        const isButtonGame = state.gameKey in BUTTON_GAMES;
        const original = await channel.messages.fetch(state.messageId).catch(() => null);
        if (original) {
          const editPayload = isButtonGame
            ? { embeds: [winEmbed], components: def.disabledRows(state.game) }
            : { embeds: [winEmbed] };
          await original.edit(editPayload);
        }
      } catch { /* ignore */ }

    // ── Timeout ───────────────────────────────────────────────────────────────
    } else {
      try {
        const isButtonGame = state.gameKey in BUTTON_GAMES;
        const original = await channel.messages.fetch(state.messageId).catch(() => null);
        if (original) {
          const editPayload = isButtonGame
            ? { embeds: [def.timeout(state.game)], components: def.disabledRows(state.game) }
            : { embeds: [def.timeout(state.game)] };
          await original.edit(editPayload);
        }
      } catch { /* ignore */ }
    }
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    this.client.recentActivity.set(message.channel.id, Date.now());

    const state = this.active.get(message.guild.id);
    if (!state || state.ended) return;
    if (state.channelId !== message.channel.id) return;

    const def = TEXT_GAMES[state.gameKey];
    if (!def) return;

    if (!state.attempts) state.attempts = new Map();
    const userId = message.author.id;
    const userAttempts = state.attempts.get(userId) || 0;
    const maxAttempts = def.maxAttempts ?? Infinity;

    if (userAttempts >= maxAttempts) return;

    if (def.validateGuess && !def.validateGuess(state.game, message)) return;

    if (def.check(state.game, message)) {
      try { await message.react('✅'); } catch { /* ignore */ }
      await this._endGame(message.guild.id, message.author);
    } else {
      state.attempts.set(userId, userAttempts + 1);
      try { await message.react('❌'); } catch { /* ignore */ }
    }
  }

  async handleInteraction(interaction) {
    if ((!interaction.isButton() && !interaction.isAnySelectMenu()) || !interaction.guild) return;

    const state = this.active.get(interaction.guild.id);
    if (!state || state.ended) return;
    if (state.channelId !== interaction.channel.id) return;

    const def = BUTTON_GAMES[state.gameKey];
    if (!def) return;

    const { customId } = interaction;
    const userId = interaction.user.id;

    // ── WYR: show voters list (ephemeral) ─────────────────────────────────────
    if (def.isWyr && def.isVoterCheck && def.isVoterCheck(customId)) {
      try {
        await interaction.reply({ embeds: [def.votersEmbed(state.game)], flags: MessageFlags.Ephemeral });
      } catch { /* ignore */ }
      return;
    }

    // ── WYR: cast vote ────────────────────────────────────────────────────────
    if (def.isWyr && def.isVote(customId)) {
      def.voteFor(state.game, interaction.user.id, customId);
      try {
        await interaction.update({ embeds: [def.embed(state.game)], components: def.rows() });
      } catch { /* ignore */ }
      return;
    }

    if (!state.buttonAttempts) state.buttonAttempts = new Map();
    const userTries = state.buttonAttempts.get(userId) || 0;
    const maxButtonAttempts = def.maxAttempts ?? Infinity;
    if (userTries >= maxButtonAttempts) {
      try { await interaction.reply({ content: '⛔ You already tried!', flags: MessageFlags.Ephemeral }); } catch { /* ignore */ }
      return;
    }

    if (def.isCorrect(state.game, customId)) {
      await this._endGame(interaction.guild.id, interaction.user);
      try { await interaction.deferUpdate().catch(() => {}); } catch { /* ignore */ }
      return;
    }

    if (def.isWrong && def.isWrong(state.game, customId)) {
      state.buttonAttempts.set(userId, userTries + 1);

      // ── Color Picker: disable the clicked button for everyone ─────────────
      if (def.onWrongClick) {
        def.onWrongClick(state.game, customId);
        try {
          const original = await interaction.channel.messages.fetch(state.messageId).catch(() => null);
          if (original) {
            await interaction.update({
              embeds: [def.embed(state.game)],
              components: def.rows(state.game),
            });
          } else {
            await interaction.deferUpdate().catch(() => {});
          }
        } catch { /* ignore */ }
        return;
      }

      // ── Other multi-attempt button games: no feedback for 1-attempt ───────
      if (maxButtonAttempts <= 1) {
        try { await interaction.deferUpdate().catch(() => {}); } catch { /* ignore */ }
        return;
      }

      try {
        await interaction.reply({
          embeds: [def.wrongEmbed ? def.wrongEmbed() : new EmbedBuilder().setDescription('❌ Wrong!').setColor(0xED4245)],
          flags: MessageFlags.Ephemeral,
        });
      } catch { /* ignore */ }
    }
  }
}

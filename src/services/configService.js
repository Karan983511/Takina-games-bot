import mongoose from 'mongoose';

// ─── Schema ────────────────────────────────────────────────────────────────────
const GuildConfigSchema = new mongoose.Schema(
  {
    guildId:            { type: String, required: true, unique: true },
    enabled:            { type: Boolean, default: true },
    allowedChannels:    { type: [String], default: [] },
    rewardRoleIds:      { type: [String], default: [] },
    minInterval:        { type: Number,  default: 10 },
    maxInterval:        { type: Number,  default: 20 },
    gameTimeoutSeconds: { type: Number,  default: 30 },
    games: {
      flag:           { type: Boolean, default: true },
      wordBackwards:  { type: Boolean, default: true },
      buttonRace:     { type: Boolean, default: true },
      colorPicker:    { type: Boolean, default: true },
      math:           { type: Boolean, default: true },
      trivia:         { type: Boolean, default: true },
      wouldYouRather: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const GuildConfig = mongoose.model('GuildConfig', GuildConfigSchema);

// ─── Defaults ──────────────────────────────────────────────────────────────────
function defaultConfig(guildId) {
  return {
    guildId,
    enabled:            true,
    allowedChannels:    [],
    rewardRoleIds:      [],
    minInterval:        10,
    maxInterval:        20,
    gameTimeoutSeconds: 30,
    games: {
      flag: true, wordBackwards: true, buttonRace: true,
      colorPicker: true, math: true, trivia: true, wouldYouRather: true,
    },
  };
}

/** Merge stored data with defaults so missing fields are always present. */
function normalize(guildId, data = {}) {
  const def = defaultConfig(guildId);

  // Migrate legacy single rewardRoleId → array
  if (data.rewardRoleId !== undefined) {
    data.rewardRoleIds = data.rewardRoleId ? [data.rewardRoleId] : [];
    delete data.rewardRoleId;
  }

  return {
    ...def,
    ...data,
    guildId,
    games:              { ...def.games,  ...(data.games  ?? {}) },
    rewardRoleIds:      data.rewardRoleIds      ?? [],
    allowedChannels:    data.allowedChannels     ?? [],
    gameTimeoutSeconds: data.gameTimeoutSeconds  ?? 30,
  };
}

// ─── ConfigService ─────────────────────────────────────────────────────────────
export class ConfigService {
  constructor() {
    /**
     * In-memory cache: guildId → plain config object.
     * All getters/setters are synchronous against the cache.
     * MongoDB writes happen asynchronously in the background.
     */
    this._cache = new Map();
  }

  /** Call once at startup — connects and pre-loads all guild configs. */
  async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('[ConfigService] MONGODB_URI is not set! Config will not persist.');
      return;
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

    const docs = await GuildConfig.find({}).lean();
    for (const doc of docs) {
      this._cache.set(doc.guildId, normalize(doc.guildId, doc));
    }

    console.log(`[ConfigService] ✅ Connected to MongoDB — ${docs.length} guild config(s) loaded`);
  }

  // ── Synchronous API (same surface as the old JSON version) ─────────────────

  get(guildId) {
    if (!this._cache.has(guildId)) {
      const def = defaultConfig(guildId);
      this._cache.set(guildId, def);
      this._persist(guildId).catch(() => {});
    }
    return this._cache.get(guildId);
  }

  set(guildId, updates) {
    const current = this.get(guildId);
    const updated  = { ...current, ...updates };
    this._cache.set(guildId, updated);
    this._persist(guildId).catch(() => {});
    return updated;
  }

  addRewardRole(guildId, roleId) {
    const cfg = this.get(guildId);
    if (!cfg.rewardRoleIds.includes(roleId)) {
      cfg.rewardRoleIds.push(roleId);
      this._cache.set(guildId, cfg);
      this._persist(guildId).catch(() => {});
    }
    return cfg;
  }

  removeRewardRole(guildId, roleId) {
    const cfg = this.get(guildId);
    cfg.rewardRoleIds = cfg.rewardRoleIds.filter(id => id !== roleId);
    this._cache.set(guildId, cfg);
    this._persist(guildId).catch(() => {});
    return cfg;
  }

  setGame(guildId, gameKey, enabled) {
    const cfg = this.get(guildId);
    cfg.games[gameKey] = enabled;
    this._cache.set(guildId, cfg);
    this._persist(guildId).catch(() => {});
    return cfg;
  }

  enabledGames(guildId) {
    const cfg = this.get(guildId);
    return Object.entries(cfg.games)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  delete(guildId) {
    this._cache.delete(guildId);
    GuildConfig.deleteOne({ guildId }).catch(() => {});
  }

  // ── Private ────────────────────────────────────────────────────────────────

  async _persist(guildId) {
    const data = this._cache.get(guildId);
    if (!data || !mongoose.connection.readyState) return;

    // Strip Mongoose internals before upserting
    const { _id, __v, createdAt, updatedAt, ...plain } = data;

    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: plain },
      { upsert: true, new: true }
    );
  }
}

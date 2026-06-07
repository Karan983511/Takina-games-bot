import mongoose from 'mongoose';

// ─── Schemas ───────────────────────────────────────────────────────────────────

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
      flag:            { type: Boolean, default: true },
      wordBackwards:   { type: Boolean, default: true },
      buttonRace:      { type: Boolean, default: true },
      colorPicker:     { type: Boolean, default: true },
      math:            { type: Boolean, default: true },
      trivia:          { type: Boolean, default: true },
      wouldYouRather:  { type: Boolean, default: true },
      numberSequence:  { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const UserCollectionSchema = new mongoose.Schema(
  {
    guildId:  { type: String, required: true },
    userId:   { type: String, required: true },
    owned:    { type: [String], default: [] },
    equipped: { type: [String], default: [] },
  },
  { timestamps: true }
);
UserCollectionSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const GuildConfig    = mongoose.model('GuildConfig',    GuildConfigSchema);
const UserCollection = mongoose.model('UserCollection', UserCollectionSchema);

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
      colorPicker: true, math: true, trivia: true,
      wouldYouRather: true, numberSequence: true,
    },
  };
}

function normalize(guildId, data = {}) {
  const def = defaultConfig(guildId);
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
    this._cache     = new Map(); // guildId → guild config
    this._userCache = new Map(); // `${guildId}:${userId}` → { owned, equipped }
  }

  /** Connect to MongoDB and pre-load all data. */
  async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('[ConfigService] MONGODB_URI is not set! Config will not persist.');
      return;
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

    const [guildDocs, userDocs] = await Promise.all([
      GuildConfig.find({}).lean(),
      UserCollection.find({}).lean(),
    ]);

    for (const doc of guildDocs) {
      this._cache.set(doc.guildId, normalize(doc.guildId, doc));
    }
    for (const doc of userDocs) {
      this._userCache.set(`${doc.guildId}:${doc.userId}`, {
        owned:    doc.owned    ?? [],
        equipped: doc.equipped ?? [],
      });
    }

    console.log(`[ConfigService] ✅ Connected to MongoDB — ${guildDocs.length} guild(s), ${userDocs.length} user collection(s) loaded`);
  }

  // ── Guild config ───────────────────────────────────────────────────────────

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

  // ── User collections ───────────────────────────────────────────────────────

  getUserCollection(guildId, userId) {
    const key = `${guildId}:${userId}`;
    if (!this._userCache.has(key)) {
      this._userCache.set(key, { owned: [], equipped: [] });
    }
    return this._userCache.get(key);
  }

  setUserCollection(guildId, userId, updates) {
    const coll = this.getUserCollection(guildId, userId);
    const updated = { ...coll, ...updates };
    this._userCache.set(`${guildId}:${userId}`, updated);
    this._persistUser(guildId, userId).catch(() => {});
    return updated;
  }

  addOwnedRole(guildId, userId, roleId) {
    const coll = this.getUserCollection(guildId, userId);
    if (!coll.owned.includes(roleId)) {
      coll.owned.push(roleId);
      return this.setUserCollection(guildId, userId, { owned: coll.owned });
    }
    return coll;
  }

  equipRole(guildId, userId, roleId) {
    const coll = this.getUserCollection(guildId, userId);
    if (!coll.owned.includes(roleId)) return coll;
    if (!coll.equipped.includes(roleId)) {
      coll.equipped.push(roleId);
      return this.setUserCollection(guildId, userId, { equipped: coll.equipped });
    }
    return coll;
  }

  unequipRole(guildId, userId, roleId) {
    const coll = this.getUserCollection(guildId, userId);
    const equipped = coll.equipped.filter(id => id !== roleId);
    return this.setUserCollection(guildId, userId, { equipped });
  }

  unequipAll(guildId, userId) {
    return this.setUserCollection(guildId, userId, { equipped: [] });
  }

  equipAll(guildId, userId) {
    const coll = this.getUserCollection(guildId, userId);
    return this.setUserCollection(guildId, userId, { equipped: [...coll.owned] });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  async _persist(guildId) {
    const data = this._cache.get(guildId);
    if (!data || !mongoose.connection.readyState) return;
    const { _id, __v, createdAt, updatedAt, ...plain } = data;
    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: plain },
      { upsert: true, new: true }
    );
  }

  async _persistUser(guildId, userId) {
    if (!mongoose.connection.readyState) return;
    const coll = this.getUserCollection(guildId, userId);
    await UserCollection.findOneAndUpdate(
      { guildId, userId },
      { $set: { owned: coll.owned, equipped: coll.equipped } },
      { upsert: true, new: true }
    );
  }
}

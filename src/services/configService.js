import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../../data/config.json');

function defaultConfig(guildId) {
  return {
    guildId,
    enabled: true,
    allowedChannels: [],
    rewardRoleIds: [],
    minInterval: 10,
    maxInterval: 20,
    gameTimeoutSeconds: 30,
    games: {
      flag: true,
      wordBackwards: true,
      buttonRace: true,
      colorPicker: true,
      math: true,
      trivia: true,
      wouldYouRather: true,
      numberSequence: true,
    },
    // userId -> { owned: [roleIds], equipped: [roleIds] }
    userCollections: {},
  };
}

export class ConfigService {
  constructor() {
    this._data = {};
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(DATA_PATH)) {
        const raw = fs.readFileSync(DATA_PATH, 'utf-8');
        this._data = JSON.parse(raw);
      }
    } catch {
      this._data = {};
    }
  }

  _save() {
    try {
      const dir = path.dirname(DATA_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify(this._data, null, 2));
    } catch (err) {
      console.error('[ConfigService] Failed to save config:', err.message);
    }
  }

  get(guildId) {
    if (!this._data[guildId]) {
      this._data[guildId] = defaultConfig(guildId);
      this._save();
    }
    const def    = defaultConfig(guildId);
    const stored = this._data[guildId];

    // Migrate legacy single rewardRoleId → rewardRoleIds array
    if (stored.rewardRoleId !== undefined) {
      stored.rewardRoleIds = stored.rewardRoleId ? [stored.rewardRoleId] : [];
      delete stored.rewardRoleId;
    }

    this._data[guildId] = {
      ...def,
      ...stored,
      games: { ...def.games, ...stored.games },
      rewardRoleIds:      stored.rewardRoleIds      ?? [],
      gameTimeoutSeconds: stored.gameTimeoutSeconds  ?? 30,
      userCollections:    stored.userCollections    ?? {},
    };
    return this._data[guildId];
  }

  getUserCollection(guildId, userId) {
    const cfg = this.get(guildId);
    return cfg.userCollections[userId] ?? { owned: [], equipped: [] };
  }

  setUserCollection(guildId, userId, updates) {
    const cfg = this.get(guildId);
    const current = cfg.userCollections[userId] ?? { owned: [], equipped: [] };
    cfg.userCollections[userId] = { ...current, ...updates };
    this._data[guildId] = cfg;
    this._save();
    return cfg.userCollections[userId];
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
    if (!coll.owned.includes(roleId)) return coll; // can't equip unowned
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

  set(guildId, updates) {
    const current = this.get(guildId);
    this._data[guildId] = { ...current, ...updates };
    this._save();
    return this._data[guildId];
  }

  addRewardRole(guildId, roleId) {
    const cfg = this.get(guildId);
    if (!cfg.rewardRoleIds.includes(roleId)) {
      cfg.rewardRoleIds.push(roleId);
      this._data[guildId] = cfg;
      this._save();
    }
    return cfg;
  }

  removeRewardRole(guildId, roleId) {
    const cfg = this.get(guildId);
    cfg.rewardRoleIds = cfg.rewardRoleIds.filter(id => id !== roleId);
    this._data[guildId] = cfg;
    this._save();
    return cfg;
  }

  setGame(guildId, gameKey, enabled) {
    const cfg = this.get(guildId);
    cfg.games[gameKey] = enabled;
    this._data[guildId] = cfg;
    this._save();
    return cfg;
  }

  enabledGames(guildId) {
    const cfg = this.get(guildId);
    return Object.entries(cfg.games)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  delete(guildId) {
    delete this._data[guildId];
    this._save();
  }
}

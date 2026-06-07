/**
 * rotationService.js
 * Periodically re-positions all active booster roles so they stay within
 * the admin-configured upper/lower boundaries.
 * This is separate from the weekly featured rotation (schedulerService.js).
 */

import BoosterSettings from '../models/BoosterSettings.js';
import BoosterRole     from '../models/BoosterRole.js';
import { getInsertPosition } from '../utils/boundary.js';
import { log }         from '../utils/logger.js';

let _client = null;

const FREQUENCY_TO_MS = {
  hourly:  60 * 60 * 1000,
  daily:   24 * 60 * 60 * 1000,
  weekly:  7  * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export function startRotationService(client) {
  _client = client;
  // Check every hour; each guild's actual frequency is controlled by settings
  setInterval(() => tick(), 60 * 60 * 1000);
  log('info', 'RotationService', 'Boundary rotation service started');
}

async function tick() {
  if (!_client) return;

  for (const guild of _client.guilds.cache.values()) {
    try {
      const settings = await BoosterSettings.findOne({ guildId: guild.id }).lean();
      if (!settings?.rotation?.enabled) continue;

      const freq = settings.rotation.frequency ?? 'daily';
      const intervalMs = freq === 'custom'
        ? (settings.rotation.customIntervalMinutes ?? 1440) * 60 * 1000
        : (FREQUENCY_TO_MS[freq] ?? FREQUENCY_TO_MS.daily);

      const lastRun = settings.rotation.lastRun ? new Date(settings.rotation.lastRun).getTime() : 0;
      if (Date.now() - lastRun < intervalMs) continue;

      await repositionRoles(guild, settings);

      await BoosterSettings.updateOne(
        { guildId: guild.id },
        { $set: { 'rotation.lastRun': new Date() } }
      );
    } catch (err) {
      log('error', 'RotationService', `Tick failed for ${guild.id}: ${err.message}`);
    }
  }
}

async function repositionRoles(guild, settings) {
  const roles = await BoosterRole.find({ guildId: guild.id, active: true, roleId: { $ne: null } }).lean();
  if (!roles.length) return;

  const basePosition = await getInsertPosition(guild);
  const moves = [];

  for (let i = 0; i < roles.length; i++) {
    const discordRole = guild.roles.cache.get(roles[i].roleId);
    if (!discordRole) continue;
    moves.push({ role: discordRole.id, position: basePosition + i });
  }

  if (moves.length) {
    await guild.roles.setPositions(moves).catch(err =>
      log('warn', 'RotationService', `setPositions failed for ${guild.id}: ${err.message}`)
    );
    log('info', 'RotationService', `Re-positioned ${moves.length} role(s) in ${guild.id}`);
  }
}

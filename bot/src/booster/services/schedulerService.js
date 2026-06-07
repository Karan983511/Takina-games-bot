import BoosterSettings  from '../models/BoosterSettings.js';
import BoosterRole      from '../models/BoosterRole.js';
import FeaturedHistory  from '../models/FeaturedHistory.js';
import VoteSession      from '../models/VoteSession.js';
import { endVoteSession } from './voteService.js';
import { getInsertPosition } from '../utils/boundary.js';
import { log } from '../utils/logger.js';

let _client = null;

export function startScheduler(client) {
  _client = client;
  setInterval(() => tick(), 60 * 60 * 1000);
  tick();
  log('info', 'Scheduler', 'Booster scheduler started');
}

async function tick() {
  const now = new Date();
  for (const guild of (_client?.guilds?.cache?.values() ?? [])) {
    try {
      const settings = await BoosterSettings.findOne({ guildId: guild.id });
      if (!settings) continue;
      if (settings.features.weeklyRotation && settings.rotation.enabled) {
        if (!settings.rotation.nextRun || now >= settings.rotation.nextRun) await runRotation(guild, settings);
      }
      if (settings.features.featuredVoting) {
        const session = await VoteSession.findOne({ guildId: guild.id, active: true });
        if (session && now >= session.endsAt) {
          await endVoteSession(guild, session);
          log('info', 'Scheduler', `Ended vote session for ${guild.id}`);
        }
      }
    } catch (err) {
      log('error', 'Scheduler', `Error in tick for ${guild.id}: ${err.message}`);
    }
  }
}

async function runRotation(guild, settings) {
  try {
    const roles = await BoosterRole.find({ guildId: guild.id, active: true }).lean();
    if (!roles.length) return;
    const currentFeatured = roles.find(r => r.featured);
    if (currentFeatured) {
      await FeaturedHistory.findOneAndUpdate(
        { guildId: guild.id, roleId: currentFeatured.roleId, unfeaturedAt: null },
        { $set: { unfeaturedAt: new Date() } }
      );
    }
    await BoosterRole.updateMany({ guildId: guild.id }, { $set: { featured: false } });
    const nonFeatured = roles.filter(r => !r.featured);
    const pick = nonFeatured[Math.floor(Math.random() * nonFeatured.length)] ?? roles[0];
    await BoosterRole.findByIdAndUpdate(pick._id, { $set: { featured: true } });
    const pos = await getInsertPosition(guild);
    await guild.roles.setPositions([{ role: pick.roleId, position: pos }]).catch(() => {});
    await FeaturedHistory.create({ guildId: guild.id, roleId: pick.roleId, userId: pick.userId, roleName: pick.name, wonByVote: false });
    const intervalDays = settings.rotation.interval || 7;
    settings.rotation.lastRun = new Date();
    settings.rotation.nextRun = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
    await settings.save();
    log('info', 'Scheduler', `Featured rotation: picked ${pick.name} in ${guild.id}`);
  } catch (err) {
    log('error', 'Scheduler', `Rotation failed for ${guild.id}: ${err.message}`);
  }
}

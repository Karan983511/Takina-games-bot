import VoteSession     from '../models/VoteSession.js';
import FeaturedHistory  from '../models/FeaturedHistory.js';
import BoosterRole      from '../models/BoosterRole.js';
import { getInsertPosition } from '../utils/boundary.js';

export async function getActiveSession(guildId) {
  return VoteSession.findOne({ guildId, active: true });
}

export async function startVoteSession(guildId, durationDays = 3) {
  await VoteSession.updateMany({ guildId, active: true }, { $set: { active: false } });
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  return VoteSession.create({ guildId, endsAt, votes: [], active: true });
}

export async function castVote(guildId, userId, roleId) {
  const session = await getActiveSession(guildId);
  if (!session) throw new Error('No active vote session. An admin can start one with `.settings vote start`.');
  const role = await BoosterRole.findOne({ guildId, roleId, active: true });
  if (!role) throw new Error('That is not an active booster role.');
  const existing = session.votes.find(v => v.userId === userId);
  if (existing) existing.roleId = roleId;
  else session.votes.push({ userId, roleId });
  await session.save();
  return session;
}

export async function endVoteSession(guild, session) {
  if (!session) return null;
  session.active = false;
  const tally = {};
  for (const v of session.votes) tally[v.roleId] = (tally[v.roleId] ?? 0) + 1;
  const entries = Object.entries(tally).sort(([,a],[,b]) => b - a);
  const [winnerId, votes] = entries[0] ?? [null, 0];
  session.winnerId = winnerId;
  await session.save();
  if (winnerId) {
    const roleDoc = await BoosterRole.findOne({ guildId: guild.id, roleId: winnerId, active: true });
    if (roleDoc) {
      await BoosterRole.updateMany({ guildId: guild.id }, { $set: { featured: false } });
      roleDoc.featured = true; await roleDoc.save();
      const pos = await getInsertPosition(guild);
      await guild.roles.setPositions([{ role: winnerId, position: pos }]).catch(() => {});
      await FeaturedHistory.create({ guildId: guild.id, roleId: winnerId, userId: roleDoc.userId, roleName: roleDoc.name, wonByVote: true, voteCount: votes });
    }
  }
  return { session, winnerId, votes };
}

export async function getHallOfFame(guildId, limit = 10) {
  return FeaturedHistory.find({ guildId }).sort({ featuredAt: -1 }).limit(limit).lean();
}

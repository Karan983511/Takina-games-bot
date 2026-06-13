const DISCORD_API_BASE = 'https://discord.com/api/v10';

function hexToInt(hex) {
  if (!hex) return null;
  const cleaned = String(hex).trim().replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return parseInt(cleaned, 16);
}

export function supportsEnhancedRoleColors(guild) {
  return !!guild?.features?.includes('ENHANCED_ROLE_COLORS');
}

export function buildRoleColorsPayload({ primary, secondary = null, tertiary = null }) {
  const payload = {};
  payload.primary_color = hexToInt(primary);
  if (secondary) payload.secondary_color = hexToInt(secondary);
  if (tertiary) payload.tertiary_color = hexToInt(tertiary);
  return payload;
}

async function discordApiRequest(method, path, body) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN is missing.');
  }

  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TakinaGamesBot/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const detail = data?.message || data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Discord API ${method} ${path} failed: ${detail}`);
  }

  return data;
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export async function patchRoleColors(guildId, roleId, colors) {
  return discordApiRequest('PATCH', `/guilds/${guildId}/roles/${roleId}`, { colors });
}

export async function createRoleWithColors(guildId, payload) {
  return discordApiRequest('POST', `/guilds/${guildId}/roles`, payload);
}

export async function fetchGuildRoles(guildId) {
  return discordApiRequest('GET', `/guilds/${guildId}/roles`);
}

export async function syncRoleColors(guild, roleId, { primary, secondary = null, tertiary = null }) {
  const colors = buildRoleColorsPayload({
    primary,
    secondary: supportsEnhancedRoleColors(guild) ? secondary : null,
    tertiary: supportsEnhancedRoleColors(guild) ? tertiary : null,
  });
  return patchRoleColors(guild.id, roleId, colors);
}

export function getRoleColorSummary(primary, secondary = null) {
  return secondary ? `${primary} → ${secondary}` : primary;
}

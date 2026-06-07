export function isValidHex(color) {
  return /^#([0-9A-Fa-f]{6})$/.test(color);
}
export function normalizeHex(color) {
  if (!color) return null;
  const c = color.trim();
  if (isValidHex(c)) return c;
  if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c}`;
  return null;
}
export function isBooster(member) { return !!member?.premiumSince; }
export function isAdmin(member) {
  return member?.permissions?.has('Administrator') || member?.permissions?.has('ManageGuild');
}
export function clampUserLimit(n) {
  const p = parseInt(n, 10);
  if (isNaN(p) || p < 0) return 0;
  return Math.min(p, 99);
}

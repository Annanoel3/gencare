// Shared color palette for family members. Each person's color comes from
// their place in the family, oldest profile first, so it's the same on every
// page (pages load members in different orders) and adding someone new never
// shifts anyone else's color.
export const MEMBER_COLOR_PALETTE = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500',
];

const FALLBACK_COLOR = 'bg-gray-400';
// Events only their owner can see.
export const PRIVATE_COLOR = FALLBACK_COLOR;

function stableOrder(list = []) {
  return [...list].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
}

export function getMemberColorClass(member, members = []) {
  if (!member) return FALLBACK_COLOR;
  if (member.color && typeof member.color === 'string' && member.color.startsWith('bg-')) return member.color;
  const idx = stableOrder(members).findIndex(m => m.id === member.id);
  return idx >= 0 ? MEMBER_COLOR_PALETTE[idx % MEMBER_COLOR_PALETTE.length] : FALLBACK_COLOR;
}

/**
 * A GenCare user's color: their profile's, if one is linked to them; else the
 * next palette colors after the profiles, so they don't share one.
 */
export function getUserColorClass(userId, members = [], accounts = []) {
  if (!userId) return FALLBACK_COLOR;
  const profile = members.find(m => m.linked_user_id === userId);
  if (profile) return getMemberColorClass(profile, members);
  const unlinked = stableOrder(accounts.filter(u => u?.id && !members.some(m => m.linked_user_id === u.id)));
  const i = unlinked.findIndex(u => u.id === userId);
  return i >= 0 ? MEMBER_COLOR_PALETTE[(members.length + i) % MEMBER_COLOR_PALETTE.length] : FALLBACK_COLOR;
}

/**
 * An event's color. Only-you events are gray. One about a family member takes
 * that member's color. One about nobody the app knows (a pet, a friend, or
 * no one) takes the color of the person whose calendar it came from.
 */
export function getEventColorClass(appt, members = [], accounts = []) {
  if (!appt) return FALLBACK_COLOR;
  if (appt.visibility === 'private') return PRIVATE_COLOR;
  if (appt.family_member_id && members.some(m => m.id === appt.family_member_id)) return getMemberColorByMemberId(appt.family_member_id, members);
  return getUserColorClass(appt.created_by_user_id || appt.created_by_id, members, accounts);
}

// Light tint versions of each palette color, for tinted containers.
const LIGHT = {
  'bg-blue-500': 'bg-blue-500/15', 'bg-emerald-500': 'bg-emerald-500/15', 'bg-purple-500': 'bg-purple-500/15',
  'bg-orange-500': 'bg-orange-500/15', 'bg-pink-500': 'bg-pink-500/15', 'bg-teal-500': 'bg-teal-500/15',
  'bg-indigo-500': 'bg-indigo-500/15', 'bg-amber-500': 'bg-amber-500/15', 'bg-gray-400': 'bg-gray-400/15',
};

export function getEventLightColorClass(appt, members = [], accounts = []) {
  return LIGHT[getEventColorClass(appt, members, accounts)] || 'bg-muted/40';
}

export function getMemberLightColorByMemberId(memberId, members = []) {
  return LIGHT[getMemberColorByMemberId(memberId, members)] || 'bg-muted/40';
}

export function getMemberColorByMemberId(memberId, members = []) {
  const member = members.find(m => m.id === memberId);
  return getMemberColorClass(member, members);
}
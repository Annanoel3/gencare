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
// Every pet shares one color: brown, which isn't in the people's palette
// (so it can't be picked for a person or look like one of their greens).
export const PET_COLOR = 'bg-amber-800';
export const isPet = (m) => /^pet$/i.test(String(m?.relationship || ''));
const people = (members = []) => members.filter((m) => !isPet(m));

function stableOrder(list = []) {
  return [...list].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
}

const picked = (m) => typeof m?.color === 'string' && m.color.startsWith('bg-');

// The palette minus colors someone picked for a person, so an automatic color
// never matches a picked one (until the palette runs out).
function freeColors(members = []) {
  const taken = new Set(people(members).filter(picked).map((m) => m.color));
  const free = MEMBER_COLOR_PALETTE.filter((c) => !taken.has(c));
  return free.length ? free : MEMBER_COLOR_PALETTE;
}

export function getMemberColorClass(member, members = []) {
  if (!member) return FALLBACK_COLOR;
  if (isPet(member)) return PET_COLOR;
  if (picked(member)) return member.color;
  const free = freeColors(members);
  const idx = stableOrder(people(members).filter((m) => !picked(m))).findIndex(m => m.id === member.id);
  return idx >= 0 ? free[idx % free.length] : FALLBACK_COLOR;
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
  const free = freeColors(members);
  const autos = people(members).filter((m) => !picked(m)).length;
  return i >= 0 ? free[(autos + i) % free.length] : FALLBACK_COLOR;
}

/**
 * An event's color. Only-you events are gray. One about a family member takes
 * that member's color (every pet: the pet color). One about nobody the app
 * knows (a friend, or no one) takes the color of the person whose calendar it
 * came from.
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
  'bg-amber-800': 'bg-amber-800/15',
};

export function getEventLightColorClass(appt, members = [], accounts = []) {
  return LIGHT[getEventColorClass(appt, members, accounts)] || 'bg-muted/40';
}

/** Colors other people (and the pets) already show, so nobody picks a duplicate. */
export function takenColors(members = [], exceptId = '') {
  const taken = new Set([PET_COLOR]);
  for (const m of people(members)) if (m.id !== exceptId) taken.add(getMemberColorClass(m, members));
  return taken;
}

export function getMemberLightColorByMemberId(memberId, members = []) {
  return LIGHT[getMemberColorByMemberId(memberId, members)] || 'bg-muted/40';
}

export function getMemberColorByMemberId(memberId, members = []) {
  const member = members.find(m => m.id === memberId);
  return getMemberColorClass(member, members);
}
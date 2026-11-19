// Event colors for the backend (the home-screen widgets draw them). Twin of
// src/utils/memberColors.js in the web app, with each Tailwind class as the
// hex it stands for. Change both together.

const HEX: Record<string, string> = {
  'bg-blue-500': '#3b82f6', 'bg-emerald-500': '#10b981', 'bg-purple-500': '#a855f7',
  'bg-orange-500': '#f97316', 'bg-pink-500': '#ec4899', 'bg-teal-500': '#14b8a6',
  'bg-indigo-500': '#6366f1', 'bg-amber-500': '#f59e0b', 'bg-gray-400': '#9ca3af',
  'bg-amber-800': '#92400e',
};
const PALETTE = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500'];
const FALLBACK = 'bg-gray-400';
const PET = 'bg-amber-800';
export const PRIVATE_HEX = HEX[FALLBACK];

const isPet = (m: any) => /^pet$/i.test(String(m?.relationship || ''));
const people = (members: any[] = []) => members.filter((m) => !isPet(m));
const picked = (m: any) => typeof m?.color === 'string' && m.color.startsWith('bg-');
const stableOrder = (list: any[] = []) => [...list].sort((a, b) =>
  String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));

function freeColors(members: any[] = []) {
  const taken = new Set(people(members).filter(picked).map((m) => m.color));
  const free = PALETTE.filter((c) => !taken.has(c));
  return free.length ? free : PALETTE;
}

function memberClass(member: any, members: any[]) {
  if (!member) return FALLBACK;
  if (isPet(member)) return PET;
  if (picked(member)) return member.color;
  const free = freeColors(members);
  const idx = stableOrder(people(members).filter((m) => !picked(m))).findIndex((m) => m.id === member.id);
  return idx >= 0 ? free[idx % free.length] : FALLBACK;
}

function userClass(userId: string, members: any[], accounts: any[]) {
  if (!userId) return FALLBACK;
  const profile = members.find((m) => m.linked_user_id === userId);
  if (profile) return memberClass(profile, members);
  const unlinked = stableOrder(accounts.filter((u) => u?.id && !members.some((m) => m.linked_user_id === u.id)));
  const i = unlinked.findIndex((u) => u.id === userId);
  const free = freeColors(members);
  const autos = people(members).filter((m) => !picked(m)).length;
  return i >= 0 ? free[(autos + i) % free.length] : FALLBACK;
}

function eventClass(appt: any, members: any[], accounts: any[]) {
  if (!appt) return FALLBACK;
  if (appt.visibility === 'private') return FALLBACK;
  if (appt.family_member_id && members.some((m) => m.id === appt.family_member_id)) {
    return memberClass(members.find((m) => m.id === appt.family_member_id), members);
  }
  return userClass(appt.created_by_user_id || appt.created_by_id, members, accounts);
}

// The person's own pick wins, then anything for a pet (Nov 14 2026: "Giving
// the dogs a bath is care"), then GenCare's, then "an appointment is care".
// TWIN of src/utils/memberColors.js isCareEvent.
export function isCareEvent(appt: any, members: any[] = []): boolean {
  if (typeof appt?.care === 'boolean') return appt.care;
  const ids: string[] = Array.isArray(appt?.family_member_ids) && appt.family_member_ids.length ? appt.family_member_ids : appt?.family_member_id ? [appt.family_member_id] : [];
  if (ids.some((id) => isPet((members || []).find((m: any) => m.id === id)))) return true;
  if (typeof appt?.ai_care === 'boolean') return appt.ai_care;
  return ['Appointment', 'Doctor', 'Therapy'].includes(String(appt?.category || ''));
}

// Does it take someone's time? Then it's in their color (Anna, Nov 17 2026:
// "anything that affects a family member's schedule/availability should be
// marked their color"); plain is for a cleaner's day, bills, holidays.
// TWIN of src/utils/memberColors.js takesTime.
const BUSY_CATEGORIES = ['Appointment', 'Doctor', 'Therapy', 'School', 'Work', 'Sports', 'Social'];
export function takesTime(appt: any, members: any[] = []): boolean {
  if (typeof appt?.colored === 'boolean') return appt.colored;
  if (typeof appt?.care === 'boolean') return appt.care;
  if (appt?.away_of || appt?.cover_of) return true;
  const ids: string[] = Array.isArray(appt?.family_member_ids) && appt.family_member_ids.length ? appt.family_member_ids : appt?.family_member_id ? [appt.family_member_id] : [];
  if (ids.some((id) => isPet((members || []).find((m: any) => m.id === id)))) return true;
  if (appt?.ai_trip === true || appt?.ai_care === true) return true;
  if (typeof appt?.ai_busy === 'boolean') return appt.ai_busy;
  return BUSY_CATEGORIES.includes(String(appt?.category || 'Appointment'));
}

/**
 * Whose event it is: the profile it's for ('pets' for a pet), or, about
 * nobody the app knows, the profile of the person who added it (their account
 * id if they have no profile). The Calendar's "one person's events" and the
 * phone export's "Whose events" both go by it.
 * TWIN of src/utils/memberColors.js whoseEvent.
 */
export function whoseEvent(appt: any, members: any[] = []): string {
  const m = appt?.family_member_id ? members.find((x: any) => x.id === appt.family_member_id) : null;
  if (m) return isPet(m) ? 'pets' : m.id;
  const by = appt?.created_by_user_id || appt?.created_by_id || '';
  return members.find((x: any) => x.linked_user_id && x.linked_user_id === by)?.id || by;
}

/** The color an event is drawn in, or '' for plain text (takes nobody's time). Only-you events are gray. */
export function eventHighlightHex(appt: any, members: any[] = [], accounts: any[] = []): string {
  if (appt?.visibility === 'private') return PRIVATE_HEX;
  return takesTime(appt, members) ? (HEX[eventClass(appt, members, accounts)] || PRIVATE_HEX) : '';
}

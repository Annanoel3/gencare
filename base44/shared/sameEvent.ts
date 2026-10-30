// The same thing on two calendars: same day, same start time, and about the
// same person or sharing a real word in their titles; never two different
// people's, never repeating, and an all-day pair needs both. Kept in step with
// src/lib/sameEvent.js, which shows such a pair once in the app.

const SKIP = new Set([
  'with', 'from', 'that', 'this', 'your', 'have', 'appt', 'appointment', 'meeting', 'call', 'visit',
  'event', 'reminder', 'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'night', 'about', 'their',
  'mom', 'moms', 'dad', 'dads', 'mother', 'father', 'grandma', 'grandpa',
]);

function titleWords(t: unknown) {
  return new Set((String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !SKIP.has(w)));
}

const startOf = (a: any) => (a.all_day || !a.time ? '' : String(a.time).slice(0, 5));

export function sameEvent(a: any, b: any): boolean {
  if (!a || !b || a.id === b.id) return false;
  if (a.recurrence || b.recurrence) return false;
  // A trip's "<name> traveling" spans days and is never one event; a
  // "<name>: doctor" stand-in IS the event it stands for.
  if (a.away_of || b.away_of) return false;
  if (!a.date || a.date !== b.date) return false;
  if (startOf(a) !== startOf(b)) return false;
  if (a.family_member_id && b.family_member_id && a.family_member_id !== b.family_member_id) return false;
  const samePerson = !!a.family_member_id && a.family_member_id === b.family_member_id;
  const wb = titleWords(b.title);
  const sharedWord = [...titleWords(a.title)].some((w) => wb.has(w));
  return startOf(a) ? samePerson || sharedWord : samePerson && sharedWord;
}

import { getUserId } from '@/lib/family';

// The same thing on two calendars (Anna, Oct 30 2026: her Mom's speech
// assessment came in from her calendar as "Austin speech labs" and from her
// Mom's as "10 speech assessment", 10-11 AM both): shown once.
//
// Two events are the same when they're on the same day at the same start
// time and either are about the same person or share a real word in their
// titles ("speech"). Never when they're about two different people (two kids'
// practices at 4 PM are two events), never a repeating one, and an all-day
// pair needs both the same person and a shared word. The same rule decides
// what a phone gets sent (functions/phoneCalendar, base44/shared/sameEvent.ts).

const SKIP = new Set([
  'with', 'from', 'that', 'this', 'your', 'have', 'appt', 'appointment', 'meeting', 'call', 'visit',
  'event', 'reminder', 'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'night', 'about', 'their',
  'mom', 'moms', 'dad', 'dads', 'mother', 'father', 'grandma', 'grandpa',
]);

function titleWords(t) {
  return new Set((String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !SKIP.has(w)));
}

const startOf = (a) => (a.all_day || !a.time ? '' : String(a.time).slice(0, 5));

export function sameEvent(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (a.recurrence || b.recurrence) return false;
  if (a.away_of || b.away_of || a.cover_of || b.cover_of) return false;
  if (!a.date || a.date !== b.date) return false;
  if (startOf(a) !== startOf(b)) return false;
  if (a.family_member_id && b.family_member_id && a.family_member_id !== b.family_member_id) return false;
  const samePerson = !!a.family_member_id && a.family_member_id === b.family_member_id;
  const wb = titleWords(b.title);
  const sharedWord = [...titleWords(a.title)].some((w) => wb.has(w));
  return startOf(a) ? samePerson || sharedWord : samePerson && sharedWord;
}

const firstName = (s) => String(s || '').trim().split(/\s+/)[0];

/**
 * One entry per real-world event. The copy shown is the viewer's own if they
 * have one, else the oldest; it borrows the place and notes from the other
 * copy when its own are empty, and `also_from` says whose calendars the
 * others came from ("Also on Pamela's calendar").
 */
export function mergeSameEvents(list, meId = getUserId()) {
  const rows = Array.isArray(list) ? list : [];
  const out = [];
  const used = new Set();
  const order = (x, y) => Number((y.created_by_user_id || y.created_by_id) === meId) - Number((x.created_by_user_id || x.created_by_id) === meId)
    || String(x.created_date || '').localeCompare(String(y.created_date || ''));
  for (const a of rows) {
    if (used.has(a.id)) continue;
    const group = [a, ...rows.filter((b) => !used.has(b.id) && b.id !== a.id && sameEvent(a, b))];
    if (group.length === 1) { out.push(a); continue; }
    group.forEach((g) => used.add(g.id));
    const [keep, ...others] = [...group].sort(order);
    const mine = keep.created_by_user_id || keep.created_by_id;
    const names = [...new Set(others
      .filter((o) => (o.created_by_user_id || o.created_by_id) !== mine)
      .map((o) => firstName(o.created_by_name)).filter(Boolean))];
    out.push({
      ...keep,
      location: keep.location || others.find((o) => o.location)?.location || '',
      notes: keep.notes || others.find((o) => o.notes)?.notes || '',
      family_member_id: keep.family_member_id || others.find((o) => o.family_member_id)?.family_member_id || '',
      family_member_name: keep.family_member_name || others.find((o) => o.family_member_name)?.family_member_name || '',
      also_from: names,
      merged_ids: others.map((o) => o.id),
    });
  }
  return out;
}

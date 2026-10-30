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
  // A trip's "<name> traveling" spans days and is never one event; a
  // "<name>: doctor" stand-in IS the event it stands for.
  if (a.away_of || b.away_of) return false;
  if (a.cover_of === b.id || b.cover_of === a.id) return !!(a.cover_of || b.cover_of);
  if (!a.date || a.date !== b.date) return false;
  if (startOf(a) !== startOf(b)) return false;
  if (a.family_member_id && b.family_member_id && a.family_member_id !== b.family_member_id) return false;
  const samePerson = !!a.family_member_id && a.family_member_id === b.family_member_id;
  const wb = titleWords(b.title);
  const sharedWord = [...titleWords(a.title)].some((w) => wb.has(w));
  return startOf(a) ? samePerson || sharedWord : samePerson && sharedWord;
}

const firstName = (s) => String(s || '').trim().split(/\s+/)[0];

// How much a copy says. Its title counts most ("11:30 Dr. Chad's" beats
// "Pamela: doctor"; a time at the front doesn't count), then a place, then
// notes. A "<name>: doctor" stand-in always loses to the real thing.
const titleDetail = (t) => String(t || '').replace(/^\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*/i, '').trim().length;
function detail(a) {
  return (a.cover_of ? -1000 : 0) + titleDetail(a.title) * 4 + (a.location ? 10 : 0) + (a.notes ? 5 : 0) + (a.end_time ? 1 : 0);
}
const longest = (list, k) => list.map((o) => String(o[k] || '')).sort((x, y) => y.length - x.length)[0] || '';

/**
 * One entry per real-world event, and the same one for everyone who can see
 * them (Anna, Oct 30 2026: "only show one unified one to everyone", the more
 * detailed one): the copy that says the most leads, with the fullest place
 * and notes from any copy, and `also_from` says whose calendars the others
 * came from ("Also on Pamela's calendar").
 */
export function mergeSameEvents(list) {
  const rows = Array.isArray(list) ? list : [];
  const out = [];
  const used = new Set();
  const order = (x, y) => detail(y) - detail(x)
    || String(x.created_date || '').localeCompare(String(y.created_date || ''));
  for (const a of rows) {
    if (used.has(a.id)) continue;
    const group = [a, ...rows.filter((b) => !used.has(b.id) && b.id !== a.id && sameEvent(a, b))];
    if (group.length === 1) { out.push(a); continue; }
    group.forEach((g) => used.add(g.id));
    const [keep, ...others] = [...group].sort(order);
    const mine = keep.created_by_user_id || keep.created_by_id;
    const names = [...new Set(others
      .filter((o) => !o.cover_of && (o.created_by_user_id || o.created_by_id) !== mine)
      .map((o) => firstName(o.created_by_name)).filter(Boolean))];
    // Their own private event with GenCare's "<name>: doctor" stand-in for the
    // family: it shows as what the family sees (Anna, Oct 30 2026: "I want my
    // calendar to show what the family is seeing"), and opens their own event
    // (realEvent below).
    const cover = keep.cover_of || keep.visibility !== 'private' ? null
      : others.find((o) => o.cover_of === keep.id) || others.find((o) => o.cover_of);
    if (cover) {
      out.push({
        ...keep,
        title: cover.title,
        visibility: cover.visibility || 'family',
        shared_with: cover.shared_with || [],
        family_member_id: keep.family_member_id || cover.family_member_id || '',
        family_member_name: keep.family_member_id ? keep.family_member_name || '' : cover.family_member_name || '',
        also_from: names,
        merged_ids: others.map((o) => o.id),
        own: keep,
      });
      continue;
    }
    out.push({
      ...keep,
      location: longest(group, 'location'),
      notes: longest(group, 'notes'),
      end_time: keep.end_time || others.find((o) => o.end_time)?.end_time || '',
      family_member_id: keep.family_member_id || others.find((o) => o.family_member_id)?.family_member_id || '',
      family_member_name: keep.family_member_name || others.find((o) => o.family_member_name)?.family_member_name || '',
      also_from: names,
      merged_ids: others.map((o) => o.id),
    });
  }
  return out;
}

/**
 * The event to open and edit for an entry from mergeSameEvents. Behind what
 * the family sees ("Anna: doctor") is the person's own private event: that's
 * the one that opens, with `family_sees` saying what the family sees instead.
 */
export function realEvent(row) {
  return row?.own ? { ...row.own, family_sees: row.title } : row;
}

// "Is this family event already on the person's phone?" (Anna, Nov 18 2026:
// export "needs to be careful not to create duplicates of things already on
// that users calendar"). Used before GenCare writes an event to a phone:
// functions/phoneCalendar checks the person's own imported events, and the
// app (src/lib/calendarSync.js runExport) checks everything on the phone.
// TWIN of src/lib/phoneMatch.js; change both together.
//
// Two entries are the same thing when they're on the same day, start within
// 15 minutes of each other (or one or both are all-day), and share a real
// word in their titles ("PT" and "Physical therapy" count) or are at the same
// place. Names of people in the family don't count as a shared word, so
// "Linda: PT" and "Linda lunch" at the same time stay two things.

// who: first name of the person it's for, when GenCare knows.
export type Occ = { day: string; startMs: number; allDay: boolean; title: string; location?: string; who?: string };

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'have', 'appt', 'appts', 'apt', 'appointment', 'appointments',
  'meeting', 'meetings', 'mtg', 'call', 'visit', 'event', 'reminder', 'today', 'tomorrow', 'morning', 'afternoon', 'evening',
  'night', 'about', 'their', 'our', 'his', 'her', 'see', 'get', 'new', 'mom', 'moms', 'dad', 'dads', 'mother', 'father',
  'grandma', 'grandpa', 'nana', 'papa', 'added', 'gencare',
]);
const SYN: Record<string, string[]> = {
  pt: ['physical', 'therapy'], physio: ['physical', 'therapy'], ot: ['occupational', 'therapy'], st: ['speech', 'therapy'],
  slp: ['speech', 'therapy'], dr: ['doctor'], doc: ['doctor'], drs: ['doctor'], doctors: ['doctor'], md: ['doctor'],
  pcp: ['doctor'], gp: ['doctor'], dentist: ['dental'], dentists: ['dental'], bday: ['birthday'], vet: ['vet'],
  ent: ['ent'], eye: ['eye'], gym: ['gym'], dmv: ['dmv'],
};

export function nameSet(names: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const n of names || []) {
    const first = String(n || '').toLowerCase().match(/[a-z]+/)?.[0];
    if (first && first.length >= 2) out.add(first);
  }
  return out;
}

export function matchWords(title: unknown, names: Set<string> = new Set()): Set<string> {
  // GenCare's own "Dad: " in front of a title is who it's for, not what it is.
  const t = String(title || '').toLowerCase().replace(/^[^:\n]{1,30}:\s+/, '').replace(/\bb-day\b/g, 'birthday');
  const out = new Set<string>();
  for (const tok of t.match(/[a-z0-9]+/g) || []) {
    if (/^\d+$/.test(tok) || names.has(tok)) continue;
    if (SYN[tok]) { SYN[tok].forEach((w) => out.add(w)); continue; }
    if (tok.length < 3 || STOP.has(tok)) continue;
    out.add(tok);
    if (tok.length > 4 && tok.endsWith('s')) out.add(tok.slice(0, -1));
  }
  return out;
}

// The family's names in it (and who it's for): two kids' practices at 4 PM
// ("Emma soccer", "Liam: Soccer") are two things.
function people(o: Occ, names: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const tok of String(o.title || '').toLowerCase().match(/[a-z]+/g) || []) if (names.has(tok)) out.add(tok);
  const w = String(o.who || '').toLowerCase().match(/[a-z]+/)?.[0];
  if (w) out.add(w);
  return out;
}

const place = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
const WINDOW_MS = 15 * 60000;

export function sameThing(a: Occ, b: Occ, names: Set<string> = new Set()): boolean {
  if (!a || !b || a.day !== b.day) return false;
  if (!a.allDay && !b.allDay && Math.abs(a.startMs - b.startMs) > WINDOW_MS) return false;
  const pa = people(a, names), pb = people(b, names);
  if (pa.size && pb.size && ![...pa].some((x) => pb.has(x))) return false;
  const wb = matchWords(b.title, names);
  if ([...matchWords(a.title, names)].some((w) => wb.has(w))) return true;
  // The same place at the same time is the same thing (both timed only).
  const la = place(a.location), lb = place(b.location);
  // "123 Main St" and "123 Main St, Dallas" are one place.
  const [short, long] = la.length <= lb.length ? [la, lb] : [lb, la];
  return !a.allDay && !b.allDay && short.length >= 6 && long.startsWith(short);
}

export function byDay(list: Occ[]): Map<string, Occ[]> {
  const m = new Map<string, Occ[]>();
  for (const o of list) { if (o?.day) (m.get(o.day) || m.set(o.day, []).get(o.day)!).push(o); }
  return m;
}

/**
 * Already there? A one-off event: its one time matches. A repeating one: at
 * least 4 in 5 of its coming times (and 2 or more) match something there, so
 * a series the person keeps on their own calendar isn't sent twice, while one
 * lucky overlap doesn't hide a whole series.
 */
export function alreadyThere(candidate: Occ[], there: Map<string, Occ[]>, names: Set<string> = new Set()): boolean {
  if (!candidate.length) return false;
  let hit = 0;
  for (const occ of candidate) if ((there.get(occ.day) || []).some((p) => sameThing(occ, p, names))) hit++;
  if (candidate.length === 1) return hit === 1;
  return hit >= 2 && hit / candidate.length >= 0.8;
}

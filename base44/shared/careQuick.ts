// The Care Log's one-tap buttons on the server, for the Care Log home-screen
// widget (functions/widgetFeed; Anna, Nov 10 2026: "a log widget. It should
// work for any type of care and be sorted accordingly by the app").
//
// TWIN of src/lib/careLog.js (BANDS, bandOf, QUICK, matchesQuick) and of the
// "who the family takes care of" rule in src/pages/CareLogPage.jsx. Change a
// button there, change it here too.

export const BANDS: Record<string, { from: number | null; to: number | null }> = {
  baby: { from: 0, to: 24 },
  toddler: { from: 24, to: 72 },
  school: { from: 72, to: 108 },
  preteen: { from: 108, to: 156 },
  teen: { from: 156, to: 216 },
  adult: { from: 216, to: 780 },
  senior: { from: 780, to: Infinity },
  general: { from: null, to: null },
  pet: { from: null, to: null },
};

export function ageMonths(birthdate: unknown, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - mo) - (now.getDate() < d ? 1 : 0);
}

const isPet = (m: any) => /^pet$/i.test(String(m?.relationship || ''));

export function bandOf(member: any, now = new Date()): string {
  if (isPet(member)) return 'pet';
  const months = ageMonths(member?.birthdate, now);
  if (months === null || months < 0) return 'general';
  for (const [key, b] of Object.entries(BANDS)) {
    if (b.from === null || b.to === null) continue;
    if (months >= b.from && months < b.to) return key;
  }
  return 'general';
}

const under18 = (birthdate: unknown) => {
  const t = birthdate ? Date.parse(String(birthdate)) : NaN;
  return Number.isFinite(t) && (Date.now() - t) / (365.25 * 86400e3) < 18;
};

/** Someone the family takes care of (CareLogPage's rule). */
export const caredFor = (m: any) => m?.is_active !== false && (isPet(m) || m?.cared_for === true || (m?.cared_for !== false && under18(m?.birthdate)));

// Tracking things for yourself (Anna, Nov 13 2026; TWIN of src/lib/carePrivacy.js):
// your own profile is always in your Care Log, and each thing you track
// there is Only you (visibility "private": only the person who logged it
// sees it) or Family. It starts as Only you unless the family helps take
// care of you; your choices are on your account (care_private_keys / care_shared_keys).
const isMine = (m: any, user: any) => !!user?.id && !!m?.linked_user_id && String(m.linked_user_id) === String(user.id);
/** Can this person see this entry? (The CareLog access rule, for the service-role widget.) */
export const canSeeLog = (l: any, user: any) => l?.visibility !== 'private' || String(l?.logged_by_user_id || '') === String(user?.id || '') || String(l?.created_by_id || '') === String(user?.id || '');
const keysOf = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
/** Is this button Only you, on your own profile? */
export function privateButton(q: Quick, member: any, user: any) {
  if (!isMine(member, user)) return false;
  const key = `b:${q.key}`;
  if (keysOf(user?.care_private_keys).includes(key)) return true;
  if (keysOf(user?.care_shared_keys).includes(key)) return false;
  return !caredFor(member);
}

export type Quick = { key: string; label: string; icon: string; row: Record<string, unknown>; ask?: boolean; daily?: boolean; last?: boolean; minMonths?: number; mood?: string[] };

const Q = (key: string, label: string, icon: string, row: Record<string, unknown>, opts: Partial<Quick> = {}): Quick => ({ key, label, icon, row, ...opts });
const meal = (key: string, label: string, icon: string, type = 'care_log') => Q(key, label, icon, type === 'food' ? { entry_type: 'food', sub_type: key, title: label } : { entry_type: 'care_log', sub_type: 'meal', title: label }, { daily: true });
const GOOD = Q('good', 'Good day', '😊', { entry_type: 'mood', mood: 'happy' }, { mood: ['happy', 'calm'] });
const HARD = Q('hard', 'Hard day', '😔', { entry_type: 'mood', mood: 'upset' }, { mood: ['anxious', 'irritable', 'upset'] });
const NOTE_Q = Q('note', 'Note', '📝', { entry_type: 'note' }, { ask: true });
const MED = Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true });

export const QUICK: Record<string, Quick[]> = {
  senior: [
    meal('breakfast', 'Breakfast', '🍳'), meal('lunch', 'Lunch', '🥪'), meal('dinner', 'Dinner', '🍽️'),
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('exercises', 'Exercises', '💪', { entry_type: 'activity', title: 'Exercises' }, { last: true }),
    Q('shower', 'Shower', '🚿', { entry_type: 'care_log', sub_type: 'hygiene', title: 'Shower' }, { daily: true, last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD,
    Q('fall', 'Fall', '⚠️', { entry_type: 'care_log', sub_type: 'fall', title: 'Fall' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  adult: [
    meal('breakfast', 'Breakfast', '🍳'), meal('lunch', 'Lunch', '🥪'), meal('dinner', 'Dinner', '🍽️'),
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('exercises', 'Exercises', '💪', { entry_type: 'activity', title: 'Exercises' }, { last: true }),
    Q('shower', 'Shower', '🚿', { entry_type: 'care_log', sub_type: 'hygiene', title: 'Shower' }, { daily: true, last: true }),
    Q('errand', 'Errand', '🛒', { entry_type: 'care_log', sub_type: 'errand', title: 'Errand' }, { ask: true, last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD,
    Q('fall', 'Fall', '⚠️', { entry_type: 'care_log', sub_type: 'fall', title: 'Fall' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  baby: [
    Q('bottle', 'Bottle', '🍼', { entry_type: 'feeding', sub_type: 'bottle' }, { ask: true, last: true }),
    Q('nursing', 'Nursing', '🤱', { entry_type: 'feeding', sub_type: 'nursing' }, { ask: true, last: true }),
    Q('wet', 'Wet diaper', '💧', { entry_type: 'diaper', sub_type: 'wet' }, { last: true }),
    Q('dirty', 'Dirty diaper', '💩', { entry_type: 'diaper', sub_type: 'dirty' }, { ask: true, last: true }),
    Q('nap', 'Nap', '😴', { entry_type: 'sleep', sub_type: 'nap' }, { ask: true, last: true }),
    Q('tummy', 'Tummy time', '🤸', { entry_type: 'tummy_time' }, { ask: true, last: true }),
    MED,
    Q('pumping', 'Pumping', '🫙', { entry_type: 'pumping' }, { ask: true, last: true }),
    Q('bath', 'Bath', '🛁', { entry_type: 'bath' }, { last: true }),
    Q('solids', 'Solids', '🥄', { entry_type: 'solids' }, { ask: true, last: true, minMonths: 4 }),
    NOTE_Q,
  ],
  toddler: [
    meal('breakfast', 'Breakfast', '🍳', 'food'), meal('lunch', 'Lunch', '🥪', 'food'), meal('dinner', 'Dinner', '🍽️', 'food'),
    Q('nap', 'Nap', '😴', { entry_type: 'sleep', sub_type: 'nap' }, { last: true }),
    Q('potty', 'Potty win', '🚽', { entry_type: 'potty', sub_type: 'success' }, { last: true }),
    Q('accident', 'Accident', '💦', { entry_type: 'potty', sub_type: 'accident' }),
    GOOD, HARD, MED,
    Q('milestone', 'Milestone', '🎯', { entry_type: 'milestone' }, { ask: true }),
    NOTE_Q,
  ],
  school: [Q('reading', 'Reading', '📚', { entry_type: 'reading' }, { ask: true, last: true }), GOOD, HARD, MED, NOTE_Q],
  preteen: [GOOD, HARD, MED, NOTE_Q],
  teen: [GOOD, HARD, MED, NOTE_Q],
  pet: [
    Q('fed', 'Fed', '🥣', { entry_type: 'pet_feeding', title: 'Fed' }, { last: true }),
    Q('walk', 'Walk', '🐾', { entry_type: 'pet_walk', title: 'Walk' }, { last: true }),
    Q('groomed', 'Groomed', '✂️', { entry_type: 'pet_grooming', title: 'Groomed' }, { last: true }),
    Q('vet', 'Vet', '🩺', { entry_type: 'pet_vet' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  general: [
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD, NOTE_Q,
  ],
};

/** Does this entry count as that button (for "done today", usage and "last")? */
export function matchesQuick(q: Quick, e: any): boolean {
  if (!e || e.entry_type !== q.row.entry_type) return false;
  if (q.mood) return q.mood.includes(e.mood);
  if (q.row.sub_type && e.sub_type !== q.row.sub_type) return false;
  const byTitle = !!q.row.title && (q.row.entry_type === 'activity' || ['meal', 'hygiene'].includes(String(q.row.sub_type)));
  if (byTitle && !String(e.title || '').toLowerCase().startsWith(String(q.row.title).toLowerCase())) return false;
  return true;
}

/** The buttons this person gets: their age band's, minus ones the family hid or they're too young for. */
export function buttonsFor(member: any, now = new Date()): Quick[] {
  const band = bandOf(member, now);
  const months = ageMonths(member?.birthdate, now);
  const hidden: string[] = Array.isArray(member?.care_hidden) ? member.care_hidden : [];
  return (QUICK[band] || QUICK.general).filter((q) => !hidden.includes(q.key) && (!q.minMonths || (months !== null && months >= q.minMonths)));
}

const pretty = (s: unknown) => { const t = String(s || '').replace(/_/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
const firstName = (s: unknown) => String(s || '').trim().split(/\s+/)[0] || '';

/** A line about an entry for the widget: icon, what it was (with how much), when, who. */
function statusOf(e: any, band: string, lead = '') {
  // A reading in "Track something": its name and what was typed.
  if (e.entry_type === 'tracker') return { i: '📈', t: [e.title || 'Reading', e.response].filter(Boolean).join(' · '), at: String(e.timestamp || ''), by: firstName(e.logged_by_name) };
  const lists = [QUICK[band] || [], ...Object.values(QUICK)];
  let q: Quick | undefined;
  for (const l of lists) { q = l.find((x) => !x.mood && x.key !== 'note' && matchesQuick(x, e)); if (q) break; }
  const mood = e.entry_type === 'mood' ? (['happy', 'calm'].includes(e.mood) ? GOOD : HARD) : undefined;
  const base = (q || mood)?.label || (['activity', 'care_log', 'pet_feeding', 'pet_walk', 'pet_grooming', 'pet_vet', 'medicine', 'note'].includes(e.entry_type) && e.title ? String(e.title) : pretty(e.entry_type));
  const bits = [lead || base];
  if (typeof e.amount === 'number' && e.amount > 0) bits.push(`${e.amount}${e.unit ? ` ${e.unit}` : ' oz'}`);
  if (e.entry_type === 'feeding' && e.sub_type === 'nursing' && (e.value || e.value_b)) bits.push(`L ${Math.round(e.value || 0)} · R ${Math.round(e.value_b || 0)} min`);
  else if (typeof e.minutes === 'number' && e.minutes > 0) bits.push(`${e.minutes} min`);
  return { i: (q || mood)?.icon || '📝', t: bits.join(' · '), at: String(e.timestamp || ''), by: firstName(e.logged_by_name) };
}

/** The local day (yyyy-MM-dd) of a moment in a timezone. */
export function dayIn(tz: string, when: Date): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(when)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * What the Care Log widget shows: everyone the family takes care of (whoever
 * was logged for most recently first), each with a line or two about the
 * latest and their buttons in the order this family uses them: the ones
 * tapped most in the last two weeks first, a once-a-day one already logged
 * today (breakfast, a shower) last, otherwise the app's order.
 *   { id, n: first name, b: band, s: [{ i, t, at, by, now? }], q: [{ k, i, l, a: opens the app for details }] }
 */
export function carePeople(members: any[], allLogs: any[], tz: string, now = new Date(), user: any = null) {
  const today = dayIn(tz, now);
  // Only what this person can see; and besides the ones the family takes care
  // of, you, and anyone who shared something they track for themselves.
  const logs = (allLogs || []).filter((l) => canSeeLog(l, user));
  const ownShared = new Set(logs.filter((l) => l.logged_by_user_id).map((l) => `${l.family_member_id}|${l.logged_by_user_id}`));
  const shown = (m: any) => m?.is_active !== false && (caredFor(m) || isMine(m, user) || (!!m?.linked_user_id && ownShared.has(`${m.id}|${m.linked_user_id}`)));
  const people = (members || []).filter(shown).map((m) => {
    const band = bandOf(m, now);
    const mine = logs.filter((l) => l.family_member_id === m.id && l.timestamp).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    const buttons = buttonsFor(m, now).map((q, order) => {
      const used = mine.filter((l) => matchesQuick(q, l));
      const doneToday = !!q.daily && used.some((l) => dayIn(tz, new Date(l.timestamp)) === today);
      return { q, order, uses: used.length, doneToday };
    }).sort((a, b) => Number(a.doneToday) - Number(b.doneToday) || b.uses - a.uses || a.order - b.order);
    // A baby: when they last ate and had a diaper (and a nap or nursing going now).
    let s: any[] = [];
    if (band === 'baby') {
      const asleep = mine.find((l) => l.entry_type === 'sleep' && l.status === 'pending');
      const nursing = mine.find((l) => l.entry_type === 'feeding' && l.sub_type === 'nursing' && l.status === 'pending');
      const fed = mine.find((l) => l.entry_type === 'feeding' && l.status !== 'pending');
      const diaper = mine.find((l) => l.entry_type === 'diaper');
      if (nursing) s.push({ ...statusOf(nursing, band, 'Nursing now'), now: true });
      else if (fed) s.push(statusOf(fed, band));
      if (asleep) s.push({ ...statusOf(asleep, band, 'Asleep'), now: true });
      if (diaper) s.push(statusOf(diaper, band));
      s = s.slice(0, 2);
    } else {
      s = mine.filter((l) => l.status !== 'pending').slice(0, 2).map((l) => statusOf(l, band));
    }
    return {
      id: String(m.id),
      n: firstName(m.name) || 'Someone',
      b: band,
      latest: mine[0]?.timestamp || '',
      s,
      q: buttons.slice(0, 9).map(({ q }) => ({ k: q.key, i: q.icon, l: q.label, a: !!q.ask })),
    };
  });
  people.sort((a, b) => String(b.latest).localeCompare(String(a.latest)) || a.n.localeCompare(b.n));
  return people.map(({ latest: _latest, ...p }) => p);
}

/** A one-tap button's entry for the widget, the same as a tap in the app (careLog.js quickRow). */
export function quickRowFor(q: Quick, member: any, user: any, now = new Date()) {
  return {
    ...(privateButton(q, member, user) ? { visibility: 'private' } : {}),
    family_id: member.family_id,
    family_member_id: member.id,
    family_member_name: member.name,
    band: bandOf(member, now),
    timestamp: now.toISOString(),
    logged_by_user_id: user.id,
    logged_by_name: user.display_name || user.full_name || '',
    ...q.row,
  };
}

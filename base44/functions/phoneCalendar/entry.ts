import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { canSee } from '../../shared/sharing.ts';
import { sortEvents, sortMembers } from '../../shared/eventSort.ts';
import { sameEvent } from '../../shared/sameEvent.ts';

// The phone's calendars and the family calendar, both ways. Called by the web
// app (on open, after edits, from the Phone calendar settings) and by the
// Android app's CalendarSyncWorker with the app closed.
//
//   { mode: "settings", ...fields }   -> saves the person's choices (which phone
//        calendars to import, whether and where to export) on their User row.
//   { mode: "import", calendarIds, rows } -> rows as CalendarBridge.readEvents
//        gives them. Each becomes an Appointment (source "phone") keyed by
//        device_key so it's never imported twice; edits on the phone update it;
//        an event gone from the phone is removed here. Imported events come in
//        as "Only me": sharing is decided per event by the person (Share with on
//        the event), never for a whole calendar at once, and a share they set
//        stays when the phone changes the event. Birthdays are not brought in.
//        Events that already happened stay (the phone only reports from now
//        on). Who sees a new import follows the person's "Who sees the events
//        you add" choice (event_sharing_default): everyone, just them, or
//        GenCare decides; then GenCare sorts the next 60 days' worth (who each
//        is about, shared or not, category — see shared/eventSort.ts), filling
//        only what the person hasn't set themselves (auto_set lists what it
//        filled). A calendar the person unticked takes its events with it, except
//        ones they shared or gave a "For": those stay as ordinary events.
//        Two imports can run at once (the app and the phone's background sync):
//        each one checks for the event again right before saving it, and the
//        end of every run removes any copy that slipped through.
//   { mode: "export_pull" }  -> what to write to THIS person's phone: every
//        event that was shared with them (the whole family, or them by name)
//        plus their own, with the calendar to write into, and the phone events
//        to delete (no longer shared with them, deleted, or export switched
//        off). Events this person imported from their own phone are never sent
//        back to it.
//   { mode: "export_report", results, deleted } -> what the phone wrote, so the
//        same phone row is updated next time instead of duplicated.
//   { mode: "prune" } -> the unticking half of the above, on its own (the
//        app calls it when a calendar is unticked, even the last one).
//   { mode: "sort_imports" } -> the sorting half on its own (after the person
//        picks or changes their sharing choice).
//   { mode: "sort", event } -> sort one new event added in the app: who it's
//        about, shared or not, category. Saves nothing; the app applies it.
//   { mode: "status" } -> counts for the settings screen.
//   { mode: "activity", since } -> for Home's "Who did what": how many events
//        each person in the family brought in from their phone since then
//        (counts only, private ones included; no titles), and when.

const DAYS_AHEAD = 365;
const DAYS_BACK = 7;

function safeTz(tz: string | undefined) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz || '' }); return tz as string; } catch (_) { return 'America/Chicago'; }
}

// Epoch ms -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in tz.
function localParts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
}

// Local date+time in tz -> epoch ms (to the minute, DST via Intl).
function localToMs(date: string, time: string, tz: string): number {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  if (!y || !m || !d) return 0;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(guess))) p[x.type] = x.value;
  const asTz = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return guess - (asTz - guess);
}

function todayIn(tz: string) { return localParts(Date.now(), tz).date; }
// 'YYYY-MM-DD' -> UTC midnight ms (how Android stores all-day events).
function utcDay(date: string): number {
  const [y, m, d] = String(date).split('-').map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : 0;
}
function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function hashOf(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isHolidayFeed(name: string) { return /^holidays? in /i.test(String(name || '').trim()); }
// Birthdays stay out of GenCare (a whole birthday calendar, or a birthday event).
function isBirthday(row: any) {
  return /birthday/i.test(String(row.calendarName || '')) || /\b(birthday|bday|b-day)\b/i.test(String(row.title || ''));
}

// Google's text on events it makes from emails ("To see detailed information
// for automatically created events…", "This event was created from an email
// you received in Gmail" + a link into the person's mailbox): not for the family.
function cleanNotes(text: unknown) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => !/automatically created events like this one|g\.co\/calendar|created from an email you received in Gmail|mail\.google\.com\/mail\?extsrc=cal/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// One phone row -> appointment fields.
function rowToAppointment(row: any, calendarId: string, tz: string, user: any) {
  const begin = Number(row.nextBegin) || Number(row.dtstart) || 0;
  if (!begin) return null;
  let end = Number(row.nextEnd) || Number(row.dtend) || 0;
  const allDay = !!row.allDay;
  let date: string, time: string, endDate = '', endTime = '';
  if (allDay) {
    // All-day rows sit at UTC midnight of the day.
    date = new Date(begin).toISOString().slice(0, 10);
    time = '';
    if (end) endDate = new Date(end - 1).toISOString().slice(0, 10);
  } else {
    const s = localParts(begin, tz);
    date = s.date; time = s.time;
    if (end && end > begin) {
      const e = localParts(end, tz);
      endTime = e.time;
      if (e.date !== date) endDate = e.date;
    }
  }
  const title = String(row.title || '').trim() || 'Untitled event';
  return {
    title,
    date, time, end_time: endTime, end_date: endDate, all_day: allDay,
    timezone: row.timezone || tz,
    location: String(row.location || ''),
    notes: cleanNotes(row.description).slice(0, 4000),
    category: guessCategory(title),
    source: 'phone',
    visibility: 'private',
    recurrence: row.rrule ? `RRULE:${row.rrule}` : '',
    created_by_user_id: user.id,
    created_by_name: user.display_name || user.full_name || '',
    reminder_minutes: -1, // the phone's own calendar already reminds about its events
    last_changed_at: new Date().toISOString(),
  };
}

function guessCategory(title: string) {
  const t = title.toLowerCase();
  if (/\b(appt|appointment|doctor|dr\.?|dentist|orthodontist|optometrist|pediatrician|clinic|haircut|salon|vet|checkup|check-up)\b/.test(t)) return 'Appointment';
  if (/\b(school|class|teacher|pta|parent|conference|tutor|homework|exam|test)\b/.test(t)) return 'School';
  if (/\b(work|shift|standup|meeting with|interview)\b/.test(t)) return 'Work';
  if (/\b(practice|game|soccer|football|baseball|basketball|swim|dance|gym|match|tournament|karate|ballet)\b/.test(t)) return 'Sports';
  if (/\b(birthday|party|dinner|lunch|brunch|visit|wedding|playdate|sleepover|bbq)\b/.test(t)) return 'Social';
  return 'Other';
}

// Work never goes to the family on its own (Anna, Oct 30 2026: her Mom's work
// meetings came in shared). Before the sorter has looked at an event, these
// are the signs: meeting words in the title, or a Teams/Zoom/Webex link in it.
function looksLikeWork(a: any) {
  const t = String(a?.title || '').toLowerCase();
  const n = String(a?.notes || '').toLowerCase();
  return /\b(work|shift|meeting|mtg|committee|budget|deadline|webinar|standup|stand-up|one-on-one|1:1|all-hands|offsite|quarterly|agenda|staff|interview|conference call|presentation|training|actuals|performance review)\b/.test(t)
    || /teams\.microsoft\.com|microsoft teams meeting|zoom\.us\/j|join zoom meeting|webex\.com|meet\.google\.com/.test(n);
}
const isWork = (a: any) => a?.category === 'Work';

// The fields GenCare filled in itself (sharing, who it's for, category), as
// opposed to ones a person picked. A person's pick is never overridden.
function autoSetOf(a: any): string[] { return Array.isArray(a?.auto_set) ? a.auto_set.map(String) : []; }
function visibilityIsAuto(a: any, auto: Set<string>) {
  // Imports from before auto_set existed all came in "Only me" by rule, so a
  // private one of those was never anyone's choice.
  return auto.has('visibility') || (!Array.isArray(a?.auto_set) && a?.source === 'phone' && (a?.visibility || 'private') === 'private');
}
function categoryIsAuto(a: any, auto: Set<string>) {
  return auto.has('category') || !a?.category || a.category === 'Other' || a.category === guessCategory(a.title || '');
}
type SharingMode = 'auto' | 'family' | 'private' | '';
function sharingMode(u: any): SharingMode {
  const v = String(u?.event_sharing_default || '');
  return v === 'auto' || v === 'family' || v === 'private' ? v : '';
}
// No choice made yet = "Only me", as before the choice existed. Work stays
// with the person whatever they picked; they can still share one by hand.
function visibilityFor(mode: SharingMode, share: boolean, work = false) {
  if (work) return 'private';
  return mode === 'family' ? 'family' : mode === 'auto' && share ? 'family' : 'private';
}

// Someone shared it, said who it's for, or changed its category: the family
// relies on it, so it's kept when its phone calendar is unticked.
function touched(a: any) {
  const auto = new Set(autoSetOf(a));
  return (a.visibility && a.visibility !== 'private' && !auto.has('visibility'))
    || (a.family_member_id && !auto.has('member'))
    || (a.category && !categoryIsAuto(a, auto));
}

// Updates in small parallel groups (hundreds one by one is slow).
async function inGroups<T>(list: T[], fn: (x: T) => Promise<unknown>, size = 8) {
  let done = 0;
  for (let i = 0; i < list.length; i += size) {
    const r = await Promise.allSettled(list.slice(i, i + size).map(fn));
    done += r.filter((x) => x.status === 'fulfilled').length;
  }
  return done;
}

// What one sorting answer changes on an event: only the fields nobody picked.
function decisionPatch(a: any, r: { who: string; share: boolean; trip?: boolean; cover?: string; care?: boolean; category: string }, mode: SharingMode, members: any[], now: string) {
  const auto = new Set(autoSetOf(a));
  const patch: Record<string, unknown> = { ai_checked_at: now, ai_share: !!r.share, ai_trip: !!r.trip, ai_cover: r.cover || '', ai_care: !!r.care, ai_sort_v: SORT_VERSION };
  if (!a.family_member_id || auto.has('member')) {
    const m = members.find((x: any) => x.id === r.who);
    if (m) { patch.family_member_id = m.id; patch.family_member_name = m.name; auto.add('member'); }
    // A sort that now finds nobody takes back an earlier guess of its own.
    else if (auto.has('member')) { patch.family_member_id = ''; patch.family_member_name = ''; auto.delete('member'); }
  }
  if (r.category && categoryIsAuto(a, auto)) { patch.category = r.category; auto.add('category'); }
  const work = (r.category || a.category) === 'Work' || (!r.category && looksLikeWork(a));
  if (visibilityIsAuto(a, auto)) { patch.visibility = visibilityFor(mode, !!r.share, work); auto.add('visibility'); }
  patch.auto_set = [...auto];
  return patch;
}

const SORT_DAYS = 60;
// Bumped when the sorting rules change, so events sorted under the old ones
// are sorted again on the next sync (2: someone the family takes care of,
// house help, and 'care' for how events show; Oct 30 2026).
const SORT_VERSION = 2;
const SORT_BATCH = 40;

// Sort these events (one AI call per 40) and save what GenCare decided for
// the fields nobody picked.
async function sortRows(db: any, user: any, familyId: string, rows: any[], members?: any[]) {
  if (!rows.length) return 0;
  const people = members || (await sortMembers(db, familyId, user.id)).members;
  const mode = sharingMode(user);
  const now = new Date().toISOString();
  const batches: any[][] = [];
  for (let i = 0; i < rows.length; i += SORT_BATCH) batches.push(rows.slice(i, i + SORT_BATCH));
  const counts = await Promise.all(batches.map(async (batch) => {
    const results = await sortEvents(
      batch.map((a: any) => ({ key: a.id, title: a.title, notes: a.notes, location: a.location, with: a.doctor_name, date: a.date, time: a.time })),
      { poster: user.display_name || user.full_name || '', posterId: user.id, members: people },
    );
    if (!results.size) return 0;
    return inGroups(batch.filter((a: any) => results.has(a.id)), (a: any) => db.Appointment.update(a.id, decisionPatch(a, results.get(a.id)!, mode, people, now)));
  }));
  return counts.reduce((x, y) => x + y, 0);
}

// Stand-ins the family sees in place of a person's private events:
//   "<Name> traveling": one all-day event per trip (from the first to the last
//     day of their own trip events, a day's gap still one trip), never the
//     hotels or plans while away (away_of = their user id).
//   "<Name>: doctor": for a private appointment the family would still want
//     to know is happening (ai_cover), the time and that plain label only;
//     overlapping ones on a day become one (cover_of = the private event).
// Kept in step every time events are sorted or imported: times follow, one
// that no longer matches is removed, and an event the person shares itself
// needs no stand-in.
async function syncAway(db: any, user: any, familyId: string) {
  const mine = (await db.Appointment.filter({ family_id: familyId, created_by_user_id: user.id })) || [];
  const real = mine.filter((a: any) => !a.away_of && !a.cover_of && a.date);
  const profile = ((await db.FamilyMember.filter({ family_id: familyId, linked_user_id: user.id })) || [])[0];
  const first = String(user.display_name || user.full_name || '').split(' ')[0] || 'Someone';
  const base = {
    shared_with: [], notes: '', location: '', doctor_name: '', reminder_minutes: -1, visibility: 'family',
    family_member_id: profile?.id || '', family_member_name: profile?.name || '',
  };
  const make = (extra: Record<string, unknown>) => db.Appointment.create({ ...base, ...extra, family_id: familyId, source: 'app', created_by_user_id: user.id, created_by_name: user.display_name || user.full_name || '', auto_set: ['visibility'] });
  const differs = (m: any, f: Record<string, unknown>) => Object.keys(f).some((k) => String(m[k] ?? '') !== String(f[k] ?? ''));

  // Trips
  const trips = real
    .filter((a: any) => a.ai_trip === true)
    .map((a: any) => ({ s: String(a.date), e: a.end_date && a.end_date > a.date ? String(a.end_date) : String(a.date) }))
    .sort((x: any, y: any) => x.s.localeCompare(y.s));
  const spans: { s: string; e: string }[] = [];
  for (const t of trips) {
    const last = spans[spans.length - 1];
    if (last && t.s <= addDays(last.e, 1)) { if (t.e > last.e) last.e = t.e; } else spans.push({ ...t });
  }
  const awayMarkers = mine.filter((a: any) => a.away_of === user.id);
  const usedAway = new Set<string>();
  for (const sp of spans) {
    const f = { title: `${first} traveling`, date: sp.s, end_date: sp.e > sp.s ? sp.e : '', all_day: true, time: '', end_time: '', category: 'Other', family_member_id: base.family_member_id };
    const m = awayMarkers.find((x: any) => !usedAway.has(x.id) && String(x.date) <= sp.e && String(x.end_date || x.date) >= sp.s);
    if (m) { usedAway.add(m.id); if (differs(m, f)) await db.Appointment.update(m.id, f); }
    else await make({ ...f, away_of: user.id });
  }
  for (const m of awayMarkers) if (!usedAway.has(m.id)) { try { await db.Appointment.delete(m.id); } catch (_) { /* gone */ } }

  // Private appointments the family should know are happening
  const covered = real
    .filter((a: any) => a.visibility === 'private' && String(a.ai_cover || '').trim() && !a.recurrence)
    .sort((x: any, y: any) => String(x.date).localeCompare(String(y.date)) || String(x.time || '').localeCompare(String(y.time || '')));
  const groups: { ids: string[]; date: string; s: string; e: string; allDay: boolean; labels: Set<string> }[] = [];
  for (const a of covered) {
    const allDay = !!a.all_day || !a.time;
    const s0 = allDay ? '' : String(a.time);
    const e0 = allDay ? '' : String(a.end_time || a.time);
    const g = groups.find((x) => x.date === a.date && (x.allDay || allDay || (s0 <= x.e && e0 >= x.s)));
    if (g) {
      g.ids.push(a.id); g.labels.add(String(a.ai_cover).trim().toLowerCase());
      if (allDay) g.allDay = true;
      if (s0 && (!g.s || s0 < g.s)) g.s = s0;
      if (e0 > g.e) g.e = e0;
    } else groups.push({ ids: [a.id], date: a.date, s: s0, e: e0, allDay, labels: new Set([String(a.ai_cover).trim().toLowerCase()]) });
  }
  const coverMarkers = mine.filter((a: any) => a.cover_of);
  const usedCover = new Set<string>();
  for (const g of groups) {
    const label = g.labels.size === 1 ? [...g.labels][0] : 'appointment';
    const f = { title: `${first}: ${label}`, date: g.date, end_date: '', all_day: g.allDay, time: g.allDay ? '' : g.s, end_time: g.allDay ? '' : (g.e > g.s ? g.e : ''), category: 'Appointment', family_member_id: base.family_member_id };
    const m = coverMarkers.find((x: any) => !usedCover.has(x.id) && g.ids.includes(String(x.cover_of)))
      || coverMarkers.find((x: any) => !usedCover.has(x.id) && x.date === g.date);
    if (m) { usedCover.add(m.id); if (differs(m, { ...f, cover_of: g.ids[0] })) await db.Appointment.update(m.id, { ...f, cover_of: g.ids[0] }); }
    else await make({ ...f, cover_of: g.ids[0] });
  }
  for (const m of coverMarkers) if (!usedCover.has(m.id)) { try { await db.Appointment.delete(m.id); } catch (_) { /* gone */ } }
}

// This person's events from a week ago through the next 60 days (and repeating ones).
function inSortWindow(a: any, tz: string) {
  const from = addDays(todayIn(tz), -7);
  const until = addDays(todayIn(tz), SORT_DAYS);
  return !!a.recurrence || (String(a.end_date || a.date || '') >= from && String(a.date || '') <= until);
}

// Sort this person's imports in the window that haven't been sorted yet (or
// that matched nobody, when a profile has been added since). One batch per
// run keeps each sync quick; the rest go on the next sync.
async function sortImports(db: any, user: any, familyId: string, tz: string) {
  const mine = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
  const { members, newest } = await sortMembers(db, familyId, user.id);
  const due = mine.filter((a: any) => {
    if (!inSortWindow(a, tz)) return false;
    if (!a.ai_checked_at || Number(a.ai_sort_v || 0) < SORT_VERSION) return true;
    return !a.family_member_id && !!newest && String(a.ai_checked_at) < newest;
  }).sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, SORT_BATCH);
  return sortRows(db, user, familyId, due, members);
}

// "Sort again" (the app owner's button): every event of theirs in the window,
// sorted fresh. Still only touches what nobody picked by hand.
async function resortAll(db: any, user: any, familyId: string, tz: string) {
  const mine = ((await db.Appointment.filter({ family_id: familyId, created_by_user_id: user.id })) || [])
    .filter((a: any) => !a.away_of && !a.cover_of && inSortWindow(a, tz))
    .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')))
    .slice(0, SORT_BATCH * 5);
  const sorted = await sortRows(db, user, familyId, mine);
  await syncAway(db, user, familyId);
  return { sorted, looked_at: mine.length };
}

// The person changed their sharing choice: their imports that GenCare (not
// they) set the sharing on follow it, from a week ago on.
async function applySharing(db: any, user: any, familyId: string, tz: string) {
  const mode = sharingMode(user);
  const from = addDays(todayIn(tz), -7);
  const mine = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
  // "Everyone" shares what the sorter has looked at, except work; one it
  // hasn't looked at yet is shared unless it looks like work.
  const want = (a: any) => visibilityFor(mode, a.ai_checked_at ? a.ai_share === true : !looksLikeWork(a), isWork(a) || (!a.ai_checked_at && looksLikeWork(a)));
  const change = mine.filter((a: any) => {
    if (!a.recurrence && String(a.end_date || a.date || '') < from) return false;
    const auto = new Set(autoSetOf(a));
    if (!visibilityIsAuto(a, auto)) return false;
    return want(a) !== (a.visibility || 'private') || !auto.has('visibility');
  });
  return inGroups(change, (a: any) => {
    const auto = new Set(autoSetOf(a));
    auto.add('visibility');
    return db.Appointment.update(a.id, { visibility: want(a), auto_set: [...auto] });
  });
}

// Over already (or today and all-day)? The phone only reports events from now
// on, so one that's over drops out of what it sends; that's not a delete.
function alreadyHappened(a: any, now: { date: string; time: string }) {
  const last = String(a.end_date || a.date || '');
  if (!last) return false;
  if (last !== now.date) return last < now.date;
  const clock = String(a.end_time || a.time || '');
  return !!a.all_day || !clock || clock <= now.time;
}

// Imports from a calendar that's no longer ticked: gone, unless touched (then
// it stays as an ordinary GenCare event).
async function pruneUnticked(db: any, user: any, familyId: string) {
  const ticked = new Set((Array.isArray(user.device_calendar_ids) ? user.device_calendar_ids : []).map(String));
  const mine = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
  let removed = 0, kept = 0;
  for (const a of mine) {
    const cal = String(a.device_key || '').split(':')[1] || '';
    if (!cal || ticked.has(cal)) continue;
    try {
      if (touched(a)) { await db.Appointment.update(a.id, { device_key: '', source: 'app' }); kept++; }
      else { await db.Appointment.delete(a.id); removed++; }
    } catch (_) { /* another run got it */ }
  }
  return { removed, kept };
}

function fieldsMatch(a: any, b: any) {
  // Not sharing: that's set once when it comes in, then it's the family's.
  return ['title', 'date', 'time', 'end_time', 'end_date', 'all_day', 'location', 'notes', 'recurrence'].every((k) => (a?.[k] ?? '') === (b?.[k] ?? ''));
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  let me: any = null;
  try { me = await base44.auth.me(); } catch (_) { me = null; }
  if (!me?.id) return Response.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  const db = base44.asServiceRole.entities;
  const user = (await db.User.filter({ id: me.id }))?.[0] || me;
  const familyId = user.family_id;
  if (!familyId) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });
  const tz = safeTz(body.timezone || user.timezone);
  const mode = String(body.mode || 'status');

  try {
    if (mode === 'settings') {
      const patch: Record<string, unknown> = {};
      const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : null);
      if (arr(body.device_calendar_ids)) patch.device_calendar_ids = arr(body.device_calendar_ids);
      if (typeof body.export_enabled === 'boolean') patch.export_enabled = body.export_enabled;
      if (typeof body.export_calendar_id === 'string') patch.export_calendar_id = body.export_calendar_id;
      if (typeof body.export_reminder_minutes === 'number') patch.export_reminder_minutes = Math.max(-1, Math.min(1440, Math.round(body.export_reminder_minutes)));
      if (['auto', 'family', 'private'].includes(String(body.event_sharing_default))) patch.event_sharing_default = String(body.event_sharing_default);
      if (Object.keys(patch).length) await db.User.update(user.id, patch);
      const after = (await db.User.filter({ id: user.id }))?.[0] || { ...user, ...patch };
      let applied = 0;
      if (patch.event_sharing_default && patch.event_sharing_default !== user.event_sharing_default) {
        applied = await applySharing(db, after, familyId, tz);
      }
      return Response.json({ ok: true, settings: pick(after), applied });
    }

    if (mode === 'resort') {
      if (user.role !== 'admin') return Response.json({ ok: false, error: 'Only the app owner can do that' }, { status: 403 });
      return Response.json({ ok: true, ...(await resortAll(db, user, familyId, tz)) });
    }

    if (mode === 'away') {
      await syncAway(db, user, familyId);
      return Response.json({ ok: true });
    }

    if (mode === 'sort_imports') {
      const sorted = await sortImports(db, user, familyId, tz);
      await syncAway(db, user, familyId);
      return Response.json({ ok: true, sorted });
    }

    if (mode === 'sort') {
      const e = body.event || {};
      const title = String(e.title || '').trim();
      if (!title) return Response.json({ ok: false, error: 'No title' }, { status: 400 });
      const { members } = await sortMembers(db, familyId, user.id);
      const r = (await sortEvents([{ key: 'e', title, notes: e.notes, location: e.location, with: e.with, date: e.date, time: e.time }], { poster: user.display_name || user.full_name || '', posterId: user.id, members })).get('e');
      if (!r) return Response.json({ ok: false, error: 'Could not sort' });
      const m = members.find((x) => x.id === r.who);
      return Response.json({ ok: true, member_id: m?.id || '', member_name: m?.name || '', share: r.share, trip: r.trip, cover: r.cover, care: r.care, category: r.category });
    }

    if (mode === 'activity') {
      const since = String(body.since || '');
      const rows = ((await db.Appointment.filter({ family_id: familyId, source: 'phone' })) || [])
        .filter((a: any) => !a.away_of && !a.cover_of && (!since || new Date(String(a.created_date || '').replace(/(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)$/, '$1Z')).toISOString() >= since));
      const by = new Map<string, { user_id: string; name: string; total: number; latest: string }>();
      for (const a of rows) {
        const id = String(a.created_by_user_id || a.created_by_id || '');
        if (!id) continue;
        const g = by.get(id) || { user_id: id, name: String(a.created_by_name || ''), total: 0, latest: '' };
        g.total++;
        if (String(a.created_date || '') > g.latest) g.latest = String(a.created_date || '');
        by.set(id, g);
      }
      return Response.json({ ok: true, people: [...by.values()] });
    }

    if (mode === 'prune') {
      const r = await pruneUnticked(db, user, familyId);
      return Response.json({ ok: true, ...r });
    }

    if (mode === 'import') {
      // The calendars saved as ticked decide; a phone still running on an
      // older list can't bring an unticked calendar back.
      const saved = Array.isArray(user.device_calendar_ids) ? new Set(user.device_calendar_ids.map(String)) : null;
      const calendarIds: string[] = (Array.isArray(body.calendarIds) ? body.calendarIds : []).map(String).filter(Boolean).filter((id: string) => !saved || saved.has(id));
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (!calendarIds.length) {
        const r = await pruneUnticked(db, user, familyId);
        return Response.json({ ok: true, created: 0, updated: 0, removed: r.removed, skipped: 'no_calendars' });
      }
      // Rows GenCare itself wrote to this phone (exports) must not come back as imports.
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const exportedIds = new Set(links.map((l: any) => String(l.device_event_id || '')).filter(Boolean));
      const existing = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
      const byKey = new Map(existing.map((a: any) => [a.device_key, a]));
      const seen = new Set<string>();
      let created = 0, updated = 0, removed = 0;
      const horizon = addDays(todayIn(tz), DAYS_AHEAD);
      for (const row of rows) {
        const cal = String(row.calendarId || '');
        if (!calendarIds.includes(cal)) continue;
        if (exportedIds.has(String(row.id || ''))) continue;
        if (isHolidayFeed(row.calendarName || '')) continue;
        if (isBirthday(row)) continue;
        const key = row.originalId
          ? `${user.id}:${cal}:${row.originalId}_${row.originalInstanceTime || row.dtstart || 0}`
          : `${user.id}:${cal}:${row.id}`;
        const fields = rowToAppointment(row, cal, tz, user);
        if (!fields) continue;
        if (fields.date > horizon) continue;
        seen.add(key);
        const have = byKey.get(key);
        if (have) {
          const keep: Record<string, unknown> = { ...fields };
          // What the family changed here stays: who it's for, the category, who it's shared with.
          if (have.family_member_id) { delete keep.family_member_id; }
          if (have.category && have.category !== 'Other') delete keep.category;
          delete keep.visibility;
          // The place and notes follow the phone only when they changed on the
          // phone since the last sync. Otherwise what someone typed here stays
          // (Anna, Oct 29 2026: an address she pasted into Mom's assessment was
          // wiped by the next sync because the phone's copy had no address).
          for (const k of ['location', 'notes']) {
            const fromPhone = String((fields as any)[k] || '');
            const last = have[`phone_${k}`];
            const changedOnPhone = last === undefined || last === null ? !!fromPhone : fromPhone !== String(last);
            if (!changedOnPhone) delete keep[k];
            keep[`phone_${k}`] = fromPhone;
          }
          const next = { ...have, ...keep };
          if (!fieldsMatch(have, next) || (have.phone_location ?? null) !== keep.phone_location || (have.phone_notes ?? null) !== keep.phone_notes) {
            await db.Appointment.update(have.id, keep);
            updated++;
          }
        } else {
          // The same thing already added by hand (title, day, time): link rather than duplicate.
          const twin = ((await db.Appointment.filter({ family_id: familyId, date: fields.date, title: fields.title })) || [])
            .find((a: any) => (a.time || '') === (fields.time || '') && !a.device_key);
          if (twin) {
            // Linked: the phone's place and notes fill in what's empty here.
            await db.Appointment.update(twin.id, {
              device_key: key, source: 'phone', created_by_user_id: twin.created_by_user_id || user.id,
              phone_location: fields.location || '', phone_notes: fields.notes || '',
              ...(twin.location ? {} : { location: fields.location || '' }),
              ...(twin.notes ? {} : { notes: fields.notes || '' }),
            });
            updated++;
          } else {
            // Another import (the phone's background sync) may have saved it a moment ago.
            const already = ((await db.Appointment.filter({ family_id: familyId, device_key: key })) || []).length > 0;
            if (!already) {
              // Sharing follows the person's choice ("GenCare decides" starts
              // it at Only me until it's sorted, a moment later). With
              // "Everyone", anything that looks like work starts at Only me too,
              // and the sorter keeps work there.
              const startShared = sharingMode(user) === 'family' && !looksLikeWork(fields);
              await db.Appointment.create({ ...fields, phone_location: fields.location || '', phone_notes: fields.notes || '', visibility: startShared ? 'family' : 'private', auto_set: ['visibility', 'category'], ...(looksLikeWork(fields) ? { category: 'Work' } : {}), family_id: familyId, device_key: key });
              created++;
            }
          }
        }
      }
      // Gone from the phone (in a calendar we were sent), or a birthday: gone
      // here. One that's simply over stays, as a record of what happened.
      const nowHere = localParts(Date.now(), tz);
      for (const a of existing) {
        const cal = String(a.device_key || '').split(':')[1] || '';
        if (!calendarIds.includes(cal) || seen.has(a.device_key)) continue;
        const birthday = /\b(birthday|bday|b-day)\b/i.test(String(a.title || ''));
        if (!birthday && !a.recurrence && alreadyHappened(a, nowHere)) continue;
        try { await db.Appointment.delete(a.id); removed++; } catch (_) { /* another run got it */ }
      }
      removed += (await pruneUnticked(db, user, familyId)).removed;
      // Two imports at once can each save the same event: keep one copy. Every
      // run picks the same keeper (one someone shared or assigned, else the
      // oldest), so two runs cleaning up at once never delete each other's.
      const now = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
      const groups = new Map<string, any[]>();
      for (const a of now) { if (a.device_key) (groups.get(a.device_key) || groups.set(a.device_key, []).get(a.device_key)!).push(a); }
      let duplicates = 0;
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        list.sort((a: any, b: any) => (Number(!!touched(b)) - Number(!!touched(a))) || String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
        for (const extra of list.slice(1)) {
          try { await db.Appointment.delete(extra.id); duplicates++; } catch (_) { /* the other run got it */ }
        }
      }
      let sorted = 0;
      try { sorted = await sortImports(db, user, familyId, tz); } catch (e) { console.error('[phoneCalendar] sort', (e as Error).message); }
      try { await syncAway(db, user, familyId); } catch (e) { console.error('[phoneCalendar] away', (e as Error).message); }
      return Response.json({ ok: true, created, updated, removed, duplicates, sorted, total: seen.size, synced_at: new Date().toISOString() });
    }

    if (mode === 'export_pull') {
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      const deletes: string[] = [];
      const events: any[] = [];
      if (!user.export_enabled || !user.export_calendar_id) {
        // Export off: whatever GenCare wrote to the phone comes off it.
        for (const l of links) {
          if (l.status === 'written' && l.device_event_id) deletes.push(String(l.device_event_id));
        }
        return Response.json({ ok: true, calendarId: '', events, deletes, exporting: false });
      }
      const from = addDays(todayIn(tz), -DAYS_BACK);
      const to = addDays(todayIn(tz), DAYS_AHEAD);
      const all = (await db.Appointment.filter({ family_id: familyId })) || [];
      const wanted = new Map<string, any>();
      const ownPhone = (a: any) => a.source === 'phone' && (a.created_by_user_id === user.id || a.created_by_id === user.id);
      const mineFromPhone = all.filter(ownPhone);
      for (const a of all) {
        if (!a.date || a.date < from || a.date > to) continue;
        if (!canSee(a, user.id)) continue;
        // Came from this person's own phone: it's already there.
        if (ownPhone(a)) continue;
        // The same event is already on their phone from their own calendar
        // (someone else's copy of it, under another name): not twice.
        if (mineFromPhone.some((m: any) => sameEvent(a, m))) continue;
        wanted.set(a.id, a);
      }
      const reminder = typeof user.export_reminder_minutes === 'number' ? user.export_reminder_minutes : 30;
      for (const a of wanted.values()) {
        const link = byAppt.get(a.id);
        const poster = a.created_by_user_id && a.created_by_user_id !== user.id ? String(a.created_by_name || '').split(' ')[0] : '';
        const forWhom = a.away_of || a.cover_of ? '' : a.family_member_name ? `${a.family_member_name}: ` : poster ? `${poster}: ` : '';
        const title = `${forWhom}${a.title}`;
        const description = [a.notes || '', a.doctor_name ? `With ${a.doctor_name}` : '', 'Added from GenCare'].filter(Boolean).join('\n');
        const eventTz = a.timezone ? safeTz(a.timezone) : tz;
        const startMs = a.all_day ? utcDay(a.date) : localToMs(a.date, a.time || '09:00', eventTz);
        let endMs = 0;
        if (a.all_day) endMs = (a.end_date && a.end_date > a.date ? utcDay(a.end_date) : startMs) + 86_400_000;
        else if (a.end_time) endMs = localToMs(a.end_date || a.date, a.end_time, eventTz);
        if (!startMs) continue;
        if (!endMs || endMs <= startMs) endMs = startMs + (a.all_day ? 86_400_000 : 3_600_000);
        const hash = await hashOf([title, description, a.location || '', startMs, endMs, a.all_day ? 1 : 0, reminder, user.export_calendar_id, a.recurrence || ''].join('|'));
        if (link && link.status === 'written' && link.written_hash === hash && link.device_calendar_id === user.export_calendar_id) continue;
        if (link && link.status === 'written' && link.device_event_id && link.device_calendar_id && link.device_calendar_id !== user.export_calendar_id) {
          // Moved to another calendar: the old row goes, a new one is written.
          deletes.push(String(link.device_event_id));
        }
        events.push({
          key: a.id,
          title, description,
          location: a.location || '',
          startMs, endMs,
          allDay: !!a.all_day,
          timezone: a.timezone || tz,
          reminderMinutes: a.all_day ? -1 : reminder,
          // A repeating event goes to the phone as a series (the phone expands it).
          rrule: a.recurrence ? String(a.recurrence).replace(/^RRULE:/i, '') : '',
          deviceEventId: link && link.device_calendar_id === user.export_calendar_id ? (link.device_event_id || '') : '',
          hash,
        });
        if (!link) {
          await db.CalendarExportLink.create({ user_id: user.id, family_id: familyId, appointment_id: a.id, device_calendar_id: user.export_calendar_id, status: 'pending' });
        } else if (link.status !== 'pending' || link.device_calendar_id !== user.export_calendar_id) {
          await db.CalendarExportLink.update(link.id, { status: 'pending', device_calendar_id: user.export_calendar_id, written_hash: '' });
        }
      }
      // No longer wanted (deleted, made private, filtered out): off the phone.
      for (const l of links) {
        if (wanted.has(l.appointment_id)) continue;
        if (l.status === 'written' && l.device_event_id) {
          deletes.push(String(l.device_event_id));
          await db.CalendarExportLink.update(l.id, { status: 'delete_pending' });
        } else if (l.status === 'pending' || l.status === 'failed') {
          await db.CalendarExportLink.delete(l.id);
        }
      }
      return Response.json({ ok: true, calendarId: String(user.export_calendar_id), events, deletes: [...new Set(deletes)], exporting: true });
    }

    if (mode === 'export_report') {
      const results: any[] = Array.isArray(body.results) ? body.results : [];
      const deleted: string[] = (Array.isArray(body.deleted) ? body.deleted : []).map(String);
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      let written = 0, failed = 0, cleared = 0;
      const now = new Date().toISOString();
      for (const r of results) {
        const link = byAppt.get(String(r.key || ''));
        if (!link) continue;
        if (r.ok && r.deviceEventId) {
          await db.CalendarExportLink.update(link.id, { status: 'written', device_event_id: String(r.deviceEventId), device_calendar_id: user.export_calendar_id || link.device_calendar_id, written_hash: String(r.hash || body.hashes?.[r.key] || ''), written_at: now, error: '' });
          written++;
        } else {
          await db.CalendarExportLink.update(link.id, { status: 'failed', error: String(r.error || 'unknown'), written_at: now });
          failed++;
        }
      }
      for (const l of links) {
        if (deleted.includes(String(l.device_event_id || '')) && (l.status === 'delete_pending' || !user.export_enabled)) {
          await db.CalendarExportLink.delete(l.id);
          cleared++;
        }
      }
      return Response.json({ ok: true, written, failed, cleared });
    }

    // status
    const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
    const imported = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
    return Response.json({
      ok: true,
      settings: pick(user),
      imported: imported.length,
      exported: links.filter((l: any) => l.status === 'written').length,
      pending: links.filter((l: any) => l.status === 'pending').length,
      failed: links.filter((l: any) => l.status === 'failed').length,
    });
  } catch (e) {
    console.error('[phoneCalendar]', mode, (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

function pick(u: any) {
  return {
    device_calendar_ids: u.device_calendar_ids || [],
    import_share_calendar_ids: u.import_share_calendar_ids || [],
    export_enabled: !!u.export_enabled,
    export_calendar_id: u.export_calendar_id || '',
    export_reminder_minutes: typeof u.export_reminder_minutes === 'number' ? u.export_reminder_minutes : 30,
    event_sharing_default: sharingMode(u),
  };
}

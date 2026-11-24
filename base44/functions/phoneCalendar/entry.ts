import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { canSee } from '../../shared/sharing.ts';
import { sortEvents, sortMembers } from '../../shared/eventSort.ts';
import { aiOk, aiRefusal } from '../../shared/aiConsent.ts';
import { sameEvent } from '../../shared/sameEvent.ts';
import { whoseEvent } from '../../shared/eventColors.ts';
import { alreadyThere, byDay, nameSet, type Occ } from '../../shared/phoneMatch.ts';
import { expandAppointments, parseRRule } from '../../shared/recurrence.ts';

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
// The last line of every event GenCare writes to a phone. A row ending in it
// is GenCare's own, never something to bring in or to call "already there".
const MARK = 'Added from GenCare';

// One-time reminders go on the phone too, the way the family calendar shows
// them (src/lib/reminders.js reminderEvents; Anna, Nov 21 2026: "Wheres my
// export to calendar"). As an event: its key is "reminder-<id>". "Until it's
// done", daily and weekly ones aren't on the calendar, so they don't go.
// TWIN of reminderEvents (title, day, time, end, who, who sees it).
function reminderAsEvent(m: any, accounts: any[]) {
  const time = (Array.isArray(m.times) ? m.times : [])[0] || '';
  const end = /^\d{2}:\d{2}$/.test(m.end_time || '') && time && m.end_time > time ? m.end_time : '';
  const by = m.owner_user_id || m.created_by_id || '';
  const poster = accounts.find((u: any) => u.id === by);
  const ids = Array.isArray(m.family_member_ids) && m.family_member_ids.length ? m.family_member_ids : m.family_member_id ? [m.family_member_id] : [];
  return {
    id: `reminder-${m.id}`, reminder: true, title: `\u{1F514} ${m.medication_name || 'Reminder'}`,
    date: m.once_date, time, end_time: end, all_day: !time,
    family_member_id: ids[0] || '', family_member_ids: ids, family_member_name: m.family_member_name || '',
    visibility: m.visibility === 'private' ? 'private' : 'family', notes: m.notes || '', category: 'Other',
    created_by_user_id: by, created_by_name: poster?.display_name || poster?.full_name || '',
  };
}
function isGenCareRow(row: any) {
  return String(row?.description || '').trim().split(/\r?\n/).pop()?.trim() === MARK;
}
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
    // The zone the day and time above are in (the person's own), not the
    // event's: an invite made in California would otherwise land hours off
    // when it's sent to someone else's phone or reminded about.
    timezone: tz,
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
// "Let GenCare decide" (Anna, Nov 23 2026): the family sees anything that
// takes the person's time ("anything that affects someones schedule should
// show"), under its own name. GenCare never renames an event to hide what it
// is ("Anna: busy", "Anna: doctor"): "Hiding is different than renaming
// things." What takes nobody's time (a bill's due date, a birthday) it may
// keep with them, and so the hotel and plans on their own trip, which the
// family sees as "<name> traveling".
function aiShows(r: { share?: boolean | null; busy?: boolean | null; cover?: string | null; trip?: boolean | null }) {
  // Sorted before "busy" existed: a cover ("doctor") meant an appointment, which takes time.
  return r.share === true || ((r.busy === true || !!String(r.cover || '').trim()) && r.trip !== true);
}
// No choice made yet = "Only me", as before the choice existed. With
// "Everyone in the family", work stays with the person; they can still share
// one by hand.
function visibilityFor(mode: SharingMode, shows: boolean, work = false) {
  if (mode === 'family') return work ? 'private' : 'family';
  return mode === 'auto' && shows ? 'family' : 'private';
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
function decisionPatch(a: any, r: { who: string; share: boolean; trip?: boolean; cover?: string; care?: boolean; busy?: boolean; category: string }, mode: SharingMode, members: any[], now: string) {
  const auto = new Set(autoSetOf(a));
  const patch: Record<string, unknown> = { ai_checked_at: now, ai_share: !!r.share, ai_trip: !!r.trip, ai_cover: r.cover || '', ai_care: !!r.care, ...(typeof r.busy === 'boolean' ? { ai_busy: r.busy } : {}), ai_sort_v: SORT_VERSION };
  if (!a.family_member_id || auto.has('member')) {
    const m = members.find((x: any) => x.id === r.who);
    if (m) { patch.family_member_id = m.id; patch.family_member_name = m.name; auto.add('member'); }
    // A sort that now finds nobody takes back an earlier guess of its own.
    else if (auto.has('member')) { patch.family_member_id = ''; patch.family_member_name = ''; auto.delete('member'); }
  }
  if (r.category && categoryIsAuto(a, auto)) { patch.category = r.category; auto.add('category'); }
  const work = (r.category || a.category) === 'Work' || (!r.category && looksLikeWork(a));
  if (visibilityIsAuto(a, auto)) { patch.visibility = visibilityFor(mode, aiShows(r), work); auto.add('visibility'); }
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
async function sortRows(db: any, user: any, familyId: string, rows: any[], given?: { members: any[]; known: string[] }) {
  // The sorting is done by OpenAI: only for someone who said yes to that (shared/aiConsent).
  if (!rows.length || !aiOk(user)) return 0;
  const { members: people, known } = given || (await sortMembers(db, familyId, user.id));
  const mode = sharingMode(user);
  const now = new Date().toISOString();
  const batches: any[][] = [];
  for (let i = 0; i < rows.length; i += SORT_BATCH) batches.push(rows.slice(i, i + SORT_BATCH));
  const counts = await Promise.all(batches.map(async (batch) => {
    const results = await sortEvents(
      // A "For" someone picked by hand tells the sorter who it's about.
      batch.map((a: any) => ({ key: a.id, title: a.title, notes: a.notes, location: a.location, with: a.doctor_name, date: a.date, time: a.time, for: a.family_member_id && !autoSetOf(a).includes('member') ? a.family_member_id : '' })),
      { poster: user.display_name || user.full_name || '', posterId: user.id, members: people, known },
    );
    if (!results.size) return 0;
    return inGroups(batch.filter((a: any) => results.has(a.id)), (a: any) => db.Appointment.update(a.id, decisionPatch(a, results.get(a.id)!, mode, people, now)));
  }));
  return counts.reduce((x, y) => x + y, 0);
}

// The family's "<Name> traveling": one all-day event per trip of theirs
// (from the first to the last day of their own trip events, a day's gap still
// one trip), never the hotels or plans while away (away_of = their user id).
// Kept in step every time events are sorted or imported: dates follow, and
// one that no longer matches is removed. The "<Name>: doctor" and
// "<Name>: busy" stand-ins (cover_of) were dropped Nov 23 2026 (aiShows).
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
  // Only their own events (or ones for nobody in particular) stand in as
  // theirs: Mom's PT that Anna added is never "Anna: doctor".
  const own = (a: any) => !a.family_member_id || (!!profile?.id && a.family_member_id === profile.id);

  // Trips
  const trips = real
    .filter((a: any) => a.ai_trip === true && own(a))
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

  // No more stand-ins that rename an event ("<Name>: busy", "<Name>: doctor";
  // Anna, Nov 23 2026): what takes their time is shared under its own name
  // (aiShows), so any left from before go.
  for (const m of mine.filter((a: any) => a.cover_of)) { try { await db.Appointment.delete(m.id); } catch (_) { /* gone */ } }
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
  if (!aiOk(user)) return 0;
  const mine = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
  const { members, newest, known } = await sortMembers(db, familyId, user.id);
  const due = mine.filter((a: any) => {
    if (!inSortWindow(a, tz)) return false;
    if (!a.ai_checked_at || Number(a.ai_sort_v || 0) < SORT_VERSION) return true;
    return !a.family_member_id && !!newest && String(a.ai_checked_at) < newest;
  }).sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, SORT_BATCH);
  return sortRows(db, user, familyId, due, { members, known });
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
  // "Everyone" shares everything but work. "Let GenCare decide" shares what
  // the sorter found takes their time (aiShows); one it hasn't looked at yet
  // is shared unless it looks like work.
  const want = (a: any) => visibilityFor(mode,
    a.ai_checked_at ? aiShows({ share: a.ai_share, busy: a.ai_busy, cover: a.ai_cover, trip: a.ai_trip }) : !looksLikeWork(a),
    isWork(a) || (!a.ai_checked_at && looksLikeWork(a)));
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

// The day and time as the phone had them at the last sync, to tell a change
// made on the phone from one made here.
const whenOf = (f: any) => [f?.date, f?.time, f?.end_time, f?.end_date, f?.all_day ? 1 : 0].map((x) => String(x ?? '')).join('|');

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
  // Which phone's sign-in is calling (a hash of it): the app and its own
  // background sync share one, a person's other phone has its own.
  const auth = req.headers.get('authorization') || '';
  const session = auth ? await hashOf(`session|${auth}`) : '';

  try {
    if (mode === 'settings') {
      const patch: Record<string, unknown> = {};
      const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : null);
      if (arr(body.device_calendar_ids)) patch.device_calendar_ids = arr(body.device_calendar_ids);
      if (typeof body.export_enabled === 'boolean') patch.export_enabled = body.export_enabled;
      if (typeof body.export_calendar_id === 'string') patch.export_calendar_id = body.export_calendar_id;
      if (typeof body.export_reminder_minutes === 'number') patch.export_reminder_minutes = Math.max(-1, Math.min(1440, Math.round(body.export_reminder_minutes)));
      if (['auto', 'family', 'private'].includes(String(body.event_sharing_default))) patch.event_sharing_default = String(body.event_sharing_default);
      // Whose events go to the phone (the Calendar's "one person's events"); none = everyone.
      if (arr(body.export_member_ids)) patch.export_member_ids = [...new Set(arr(body.export_member_ids))].slice(0, 50);
      // One phone per person writes the family's events (two would put
      // everything on twice). Turning it on, picking the calendar, or "Use
      // this phone instead" makes this phone the one.
      const device = String(body.device || '').slice(0, 80);
      const turningOn = patch.export_enabled === true && !user.export_enabled;
      const claiming = !!device && (turningOn || body.export_here === true || (typeof patch.export_calendar_id === 'string' && patch.export_calendar_id !== (user.export_calendar_id || '')));
      // The same phone after GenCare was reinstalled (the app found GenCare's
      // own events right where they were written): carry on as before.
      const samePhone = body.same_phone === true && body.export_here === true;
      const moving = claiming && !!user.export_device && user.export_device !== device && !samePhone;
      if (claiming) {
        patch.export_device = device;
        patch.export_platform = body.platform === 'ios' ? 'ios' : 'android';
        if (session) patch.export_session = session;
        // The calendar picked on the other phone isn't one on this phone: pick again here.
        if (moving && typeof patch.export_calendar_id !== 'string') patch.export_calendar_id = '';
      }
      const links = turningOn || moving ? ((await db.CalendarExportLink.filter({ user_id: user.id })) || []) : [];
      if (moving) {
        // The other phone's record of what it wrote means nothing on this one,
        // except which events the person deleted from their phone: those stay off.
        for (const l of links) {
          if (l.status === 'removed_on_phone') continue;
          try { await db.CalendarExportLink.delete(l.id); } catch (_) { /* gone already */ }
        }
      } else if (turningOn) {
        // A fresh start: what was skipped as already there, or deleted from
        // the phone, gets looked at again.
        for (const l of links) {
          if (['on_phone', 'removed_on_phone'].includes(l.status) || !l.device_event_id) { try { await db.CalendarExportLink.delete(l.id); } catch (_) { /* gone already */ } }
        }
      }
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
      if (!aiOk(user)) return aiRefusal();
      const { members, known } = await sortMembers(db, familyId, user.id);
      // member_id: who the person said it's for, when they picked someone.
      const r = (await sortEvents([{ key: 'e', title, notes: e.notes, location: e.location, with: e.with, date: e.date, time: e.time, for: String(e.member_id || '') }], { poster: user.display_name || user.full_name || '', posterId: user.id, members, known })).get('e');
      if (!r) return Response.json({ ok: false, error: 'Could not sort' });
      const m = members.find((x) => x.id === r.who);
      return Response.json({ ok: true, member_id: m?.id || '', member_name: m?.name || '', share: r.share, trip: r.trip, cover: r.cover, care: r.care, busy: r.busy, category: r.category });
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
        if (exportedIds.has(String(row.id || '')) || isGenCareRow(row)) continue;
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
          // The same for the day and time (Anna, Nov 13 2026: her mom's "ENT
          // doctor" is all day on her phone; a time put in here would have gone
          // back to all day at the next sync). Before phone_when was kept, the
          // phone's always won, so a row without it still has the phone's last
          // day and time.
          const phoneWhen = whenOf(fields);
          if ((have.phone_when || whenOf(have)) === phoneWhen) {
            for (const k of ['date', 'time', 'end_time', 'end_date', 'all_day']) delete keep[k];
          }
          keep.phone_when = phoneWhen;
          // And how it repeats (Anna, Nov 14 2026: her mom's "LAIFS Meeting"
          // is every month on her phone, and it's really the second Tuesday;
          // changed here, it stays until the phone's repeat changes). Before
          // phone_rule was kept, the phone's always won, so a row without it
          // still has the phone's last repeat.
          const phoneRule = String(fields.recurrence || '');
          if (String(have.phone_rule ?? have.recurrence ?? '') === phoneRule) delete keep.recurrence;
          keep.phone_rule = phoneRule;
          const next = { ...have, ...keep };
          if (!fieldsMatch(have, next) || String(have.timezone || '') !== String(keep.timezone || '') || (have.phone_location ?? null) !== keep.phone_location || (have.phone_notes ?? null) !== keep.phone_notes || (have.phone_when ?? null) !== keep.phone_when || (have.phone_rule ?? null) !== keep.phone_rule) {
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
              phone_location: fields.location || '', phone_notes: fields.notes || '', phone_when: whenOf(fields), phone_rule: String(fields.recurrence || ''),
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
              await db.Appointment.create({ ...fields, phone_location: fields.location || '', phone_notes: fields.notes || '', phone_when: whenOf(fields), phone_rule: String(fields.recurrence || ''), visibility: startShared ? 'family' : 'private', auto_set: ['visibility', 'category'], ...(looksLikeWork(fields) ? { category: 'Work' } : {}), family_id: familyId, device_key: key });
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
      // Who's asking: the app (it reads the phone first, so it can tell what's
      // already there and what the person deleted) or the phone's own
      // background sync (it can't, so it only gets what's safe without looking).
      const bg = body.from === 'phone_background';
      const smart = !bg && Number(body.v) >= 2;
      const platform = bg ? (user.export_platform || (body.timezone ? 'ios' : 'android')) : (body.platform === 'ios' ? 'ios' : 'android');
      const device = String(body.device || '');
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      const cleanup = [...new Set(links.flatMap((l: any) => (Array.isArray(l.cleanup_ids) ? l.cleanup_ids : [])).map(String).filter(Boolean))];
      const ours = [...new Set([...links.map((l: any) => String(l.device_event_id || '')).filter(Boolean), ...cleanup])];
      const exporting = !!user.export_enabled && !!user.export_calendar_id;
      // A background sync on a phone that isn't the one writing (an old phone
      // still signed in): it does nothing. Without this it would write into a
      // calendar id that means something else on that phone.
      if (bg && session && user.export_session && session !== user.export_session) {
        return Response.json({ ok: true, exporting: false, idle: true, calendarId: '', events: [], deletes: [], ours: [] });
      }
      // Another of their phones does the writing: this one leaves the calendar alone.
      if (!bg && device && user.export_device && device !== user.export_device) {
        // A few of the events GenCare wrote, so the app can tell whether this is
        // that same phone with GenCare reinstalled (they'd be right there).
        const probe = links
          .filter((l: any) => l.status === 'written' && l.device_event_id && l.written_sig && l.device_calendar_id === user.export_calendar_id)
          .slice(0, 20)
          .map((l: any) => ({ id: String(l.device_event_id), sig: String(l.written_sig) }));
        return Response.json({ ok: true, exporting: false, other_device: true, calendarId: '', probeCalendarId: exporting ? String(user.export_calendar_id) : '', probe, events: [], deletes: [], ours: [] });
      }
      if (!bg && device && exporting && (!user.export_device || (session && session !== user.export_session))) {
        // This phone writes (the first time since the one-phone rule, or after signing in again).
        await db.User.update(user.id, { export_device: device, export_platform: platform, ...(session ? { export_session: session } : {}) });
      }
      const deletes: string[] = [...cleanup];
      const events: any[] = [];
      if (!exporting) {
        // Export off: whatever GenCare wrote to the phone comes off it.
        for (const l of links) {
          if (l.device_event_id && ['written', 'pending', 'failed', 'delete_pending'].includes(l.status)) deletes.push(String(l.device_event_id));
          else { try { await db.CalendarExportLink.delete(l.id); } catch (_) { /* gone already */ } }
        }
        return Response.json({ ok: true, calendarId: '', events, deletes: [...new Set(deletes)], ours, exporting: false });
      }
      const cal = String(user.export_calendar_id);
      const today = todayIn(tz);
      const from = addDays(today, -DAYS_BACK);
      const to = addDays(today, DAYS_AHEAD);
      const nowMs = Date.now();
      const members = (await db.FamilyMember.filter({ family_id: familyId })) || [];
      const accounts = (await db.User.filter({ family_id: familyId })) || [];
      const oneTime = ((await db.Medication.filter({ family_id: familyId })) || []).filter((m: any) => m.frequency === 'One time' && m.once_date);
      const all = [...((await db.Appointment.filter({ family_id: familyId })) || []), ...oneTime.map((m: any) => reminderAsEvent(m, accounts))];
      const byId = new Map(all.map((a: any) => [a.id, a]));
      const tzOf = new Map(accounts.map((u: any) => [u.id, u.timezone ? safeTz(u.timezone) : '']));
      const names = nameSet([...members.map((m: any) => m.name), ...accounts.map((u: any) => u.display_name || u.full_name)]);
      // The zone an event's day and time are in: a phone import's are its
      // owner's (older imports saved the invite's own zone by mistake); one
      // typed in has none, so it's the same clock time here as in the app.
      const zoneOf = (a: any) => (a.source === 'phone' && tzOf.get(a.created_by_user_id)) || (a.timezone ? safeTz(a.timezone) : tz);
      const known = new Set(['pets', ...members.map((m: any) => m.id), ...accounts.map((u: any) => u.id)]);
      const only = (Array.isArray(user.export_member_ids) ? user.export_member_ids : []).map(String).filter((id: string) => known.has(id));
      const ownPhone = (a: any) => a.source === 'phone' && (a.created_by_user_id === user.id || a.created_by_id === user.id);
      const eligible = (a: any) => {
        if (!a.date || !canSee(a, user.id) || ownPhone(a)) return false;
        // Their own trip as the family sees it ("Anna traveling"): they have the real thing.
        if (a.away_of && a.away_of === user.id) return false;
        // A "Mom: doctor" stand-in for a private event they can see themselves.
        if (a.cover_of) { const real = byId.get(a.cover_of); if (real && canSee(real, user.id)) return false; }
        // A reminder for several people goes when any of them is picked.
        const whose = a.reminder && a.family_member_ids.length ? a.family_member_ids.map((id: string) => whoseEvent({ ...a, family_member_id: id }, members)) : [whoseEvent(a, members)];
        if (only.length && !whose.some((w: string) => only.includes(w))) return false;
        return true;
      };
      // A repeating event counts while it still happens in the window, however long ago it started.
      const inWindow = (a: any) => (a.recurrence
        ? expandAppointments([a], from, to).length > 0
        : (a.end_date && a.end_date > a.date ? a.end_date : a.date) >= from && a.date <= to);
      // Each time it happens (a series: its next ones), for "already there".
      const occsOf = (a: any): Occ[] => {
        const allDay = !!a.all_day || !a.time;
        const zone = zoneOf(a);
        const list = a.recurrence ? expandAppointments([a], today, addDays(today, 400)).filter((o: any) => !o.series_date || o.date === o.series_date).slice(0, 8) : [a];
        return list.map((o: any) => ({ day: o.date, startMs: allDay ? utcDay(o.date) : localToMs(o.date, o.time, zone), allDay, title: a.title, location: a.location || '', who: a.family_member_name || '' }));
      };
      // What they brought in from their own phone, to check against (not twice).
      const mine = byDay(all.filter(ownPhone).flatMap(occsOf));

      const keepAsIs = new Set<string>();
      const candidates: any[] = [];
      for (const a of all) {
        if (!eligible(a)) continue;
        if (inWindow(a)) candidates.push(a);
        // Over (or a year out): left as it is on the phone, not taken off.
        else keepAsIs.add(a.id);
      }
      // The same event twice in the family's calendar (typed in by one
      // person, brought in from another's phone): once on the phone. The one
      // already there stays.
      const written = (a: any) => Number(byAppt.get(a.id)?.status === 'written');
      candidates.sort((x: any, y: any) => written(y) - written(x) || String(x.created_date || '').localeCompare(String(y.created_date || '')) || String(x.id).localeCompare(String(y.id)));
      const wanted = new Map<string, any>();
      const byDate = new Map<string, any[]>();
      for (const a of candidates) {
        if ((byDate.get(a.date) || []).some((w: any) => sameEvent(a, w))) continue;
        if (alreadyThere(occsOf(a), mine, names)) continue;
        wanted.set(a.id, a);
        (byDate.get(a.date) || byDate.set(a.date, []).get(a.date)!).push(a);
      }

      const reminder = typeof user.export_reminder_minutes === 'number' ? user.export_reminder_minutes : 30;
      const sentAt = new Date().toISOString();
      // GenCare's copies with nothing to change, for the app to see whether
      // they're still on the phone: one the person deleted is then known before
      // anything about it changes (so no sync ever writes it back).
      const watch: any[] = [];
      for (const a of wanted.values()) {
        const link = byAppt.get(a.id);
        const zone = zoneOf(a);
        // No time given: all day on the phone, not a made-up 9 AM.
        const allDay = !!a.all_day || !a.time;
        const poster = a.created_by_user_id && a.created_by_user_id !== user.id ? String(a.created_by_name || '').split(' ')[0] : '';
        const forWhom = a.away_of || a.cover_of ? '' : a.family_member_name ? `${a.family_member_name}: ` : poster ? `${poster}: ` : '';
        const title = `${forWhom}${a.title}`;
        const description = [a.notes || '', a.doctor_name ? `With ${a.doctor_name}` : '', MARK].filter(Boolean).join('\n');
        const startMs = allDay ? utcDay(a.date) : localToMs(a.date, a.time, zone);
        if (!startMs) continue;
        let endMs = 0;
        if (allDay) endMs = (a.end_date && a.end_date > a.date ? utcDay(a.end_date) : startMs) + 86_400_000;
        else if (a.end_time) {
          endMs = localToMs(a.end_date || a.date, a.end_time, zone);
          // 10 PM to 1 AM: ends the next day.
          if (!a.end_date && endMs <= startMs) endMs = localToMs(addDays(a.date, 1), a.end_time, zone);
        }
        if (!endMs || endMs <= startMs) endMs = startMs + (allDay ? 86_400_000 : 3_600_000);
        const rrule = phoneRule(a, allDay, zone, platform);
        const hash = await hashOf([title, description, a.location || '', startMs, endMs, allDay ? 1 : 0, reminder, cal, rrule ? `RRULE:${rrule}` : ''].join('|'));
        const skipHash = await hashOf([a.title, a.date, a.time || '', a.end_date || '', a.end_time || '', allDay ? 1 : 0, a.recurrence || '', a.location || ''].join('|'));
        const endsMs = seriesEnds(a, allDay, zone, endMs - startMs, endMs, from, to);
        const sig = `${startMs}|${title}`;
        const base = {
          key: a.id, title, description, location: a.location || '', startMs, endMs, allDay, timezone: zone,
          reminderMinutes: allDay ? -1 : reminder, rrule, hash,
          // For the app's own look at the phone first (the phone's writer ignores these).
          endsMs, sig, prevSig: String(link?.written_sig || ''), skipHash,
          check: { title: a.title, who: a.family_member_name || '', date: a.date, time: allDay ? '' : a.time, all_day: allDay, end_date: a.end_date || '', recurrence: a.recurrence || '', tz: zone },
        };
        if (link?.status === 'removed_on_phone') {
          // Deleted from the phone: it stays off. The app only looks whether the
          // phone renumbered it (an iPhone can), and takes that copy back.
          if (smart) events.push({ ...base, deviceEventId: '', removed: true });
          continue;
        }
        if (link?.status === 'on_phone') {
          // Already on their phone their own way: left off until it changes here.
          if (link.skip_hash === skipHash || !smart) continue;
          events.push({ ...base, deviceEventId: '', recheck: true });
          continue;
        }
        if (link && link.status === 'written' && link.written_hash === hash && link.device_calendar_id === cal) {
          if (smart && link.device_event_id && (!endsMs || endsMs > nowMs)) watch.push({ key: a.id, deviceEventId: String(link.device_event_id), title, startMs, endsMs, hash, prevSig: String(link.written_sig || '') });
          continue;
        }
        if (link && link.device_event_id && ((link.device_calendar_id && link.device_calendar_id !== cal) || link.status === 'delete_pending')) {
          // Moved to another calendar (or was on its way off): the old row goes, a new one is written.
          deletes.push(String(link.device_event_id));
        }
        const deviceEventId = link && link.device_calendar_id === cal && link.status !== 'delete_pending' ? String(link.device_event_id || '') : '';
        if (!deviceEventId) {
          // Nothing to add once it's over.
          if (endsMs && endsMs <= nowMs) continue;
          if (!smart) {
            // Without a look at the phone: only a timed event (holidays and
            // birthdays are all-day), only when everything on the phone with a
            // time is in calendars GenCare brings in (so the check above saw
            // it), and never again while an earlier send is unanswered.
            const unanswered = link && link.status === 'pending' && link.sent_at && !link.device_event_id;
            if (allDay || !user.export_bg_ok || unanswered) {
              if (!link) await db.CalendarExportLink.create({ user_id: user.id, family_id: familyId, appointment_id: a.id, device_calendar_id: cal, status: 'pending' });
              continue;
            }
          }
        }
        events.push({ ...base, deviceEventId });
        const mark = { status: 'pending', device_calendar_id: cal, sent_id: deviceEventId, sent_sig: sig, sent_at: sentAt, skip_hash: skipHash, written_hash: '' };
        if (!link) await db.CalendarExportLink.create({ user_id: user.id, family_id: familyId, appointment_id: a.id, ...mark });
        else await db.CalendarExportLink.update(link.id, { ...mark, ...(link.status === 'delete_pending' ? { device_event_id: '' } : {}) });
      }
      // No longer wanted (deleted, made private, not one of the people they
      // picked, or already on their phone their own way): off the phone.
      for (const l of links) {
        if (wanted.has(l.appointment_id) || keepAsIs.has(l.appointment_id)) continue;
        // Deleted from the phone, or already there their own way: remembered
        // while the event exists (picking other people and back mustn't bring
        // a deleted one back).
        if (['removed_on_phone', 'on_phone'].includes(l.status) && byId.has(l.appointment_id)) continue;
        if (l.device_event_id && ['written', 'pending', 'failed', 'delete_pending'].includes(l.status)) {
          deletes.push(String(l.device_event_id));
          if (l.status !== 'delete_pending') await db.CalendarExportLink.update(l.id, { status: 'delete_pending' });
        } else {
          try { await db.CalendarExportLink.delete(l.id); } catch (_) { /* gone already */ }
        }
      }
      return Response.json({
        ok: true, calendarId: cal, events, watch, deletes: [...new Set(deletes)], exporting: true,
        ours, ticked: (Array.isArray(user.device_calendar_ids) ? user.device_calendar_ids : []).map(String), names: [...names], bg_ok: !!user.export_bg_ok,
      });
    }

    if (mode === 'export_report') {
      if (body.from === 'phone_background' && session && user.export_session && session !== user.export_session) {
        return Response.json({ ok: true, ignored: true });
      }
      const results: any[] = Array.isArray(body.results) ? body.results : [];
      const skipped: any[] = Array.isArray(body.skipped) ? body.skipped : [];
      const deleted = new Set((Array.isArray(body.deleted) ? body.deleted : []).map(String));
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      const cal = String(user.export_calendar_id || '');
      let written = 0, failed = 0, cleared = 0, removed = 0, there = 0;
      const now = new Date().toISOString();
      const save = async (l: any, patch: Record<string, unknown>) => { Object.assign(l, patch); await db.CalendarExportLink.update(l.id, patch); };
      // What came off the phone.
      for (const l of links) {
        const id = String(l.device_event_id || '');
        if (id && deleted.has(id) && (l.status === 'delete_pending' || !user.export_enabled)) {
          try { await db.CalendarExportLink.delete(l.id); } catch (_) { /* gone already */ }
          byAppt.delete(l.appointment_id);
          cleared++;
          continue;
        }
        const extra = (Array.isArray(l.cleanup_ids) ? l.cleanup_ids : []).map(String);
        if (extra.some((x: string) => deleted.has(x))) await save(l, { cleanup_ids: extra.filter((x: string) => !deleted.has(x)) });
      }
      for (const r of results) {
        const link = byAppt.get(String(r.key || ''));
        if (!link) continue;
        if (r.ok && r.deviceEventId) {
          const got = String(r.deviceEventId);
          const asked = String(link.sent_id || '');
          const cleanupWith = [...new Set([...(Array.isArray(link.cleanup_ids) ? link.cleanup_ids : []).map(String), got])];
          if (!r.adopted && asked && got !== asked) {
            // Asked to change a row that's gone, the phone made a new one: the
            // person deleted it from their phone. The new copy comes off at the
            // next sync, and it stays off.
            await save(link, { status: 'removed_on_phone', device_event_id: '', cleanup_ids: cleanupWith, written_hash: '', error: '' });
            removed++;
            continue;
          }
          if (!r.adopted && !asked && link.status === 'written' && link.device_event_id && String(link.device_event_id) !== got) {
            // Two syncs at once both added it: the first stays, the second comes off.
            await save(link, { cleanup_ids: cleanupWith });
            continue;
          }
          await save(link, { status: 'written', device_event_id: got, device_calendar_id: cal || link.device_calendar_id, written_hash: String(r.hash || body.hashes?.[r.key] || ''), written_sig: String(r.sig || link.sent_sig || ''), written_at: now, error: '' });
          written++;
        } else {
          await save(link, { status: 'failed', error: String(r.error || 'unknown').slice(0, 300), written_at: now });
          failed++;
        }
      }
      for (const x of skipped) {
        const link = byAppt.get(String(x.key || ''));
        if (!link) continue;
        if (x.why === 'on_phone') {
          await save(link, { status: 'on_phone', device_event_id: '', written_hash: '', skip_hash: String(x.skipHash || link.skip_hash || ''), error: '' });
          there++;
        } else if (x.why === 'removed_on_phone') {
          await save(link, { status: 'removed_on_phone', device_event_id: '', written_hash: '', error: '' });
          removed++;
        } else if (x.why === 'past' && link.device_event_id) {
          // Over, and the phone no longer lists it to check: left as it was.
          await save(link, { status: 'written', written_hash: String(x.hash || ''), error: '' });
        }
      }
      if (typeof body.bg_ok === 'boolean' && body.bg_ok !== !!user.export_bg_ok) await db.User.update(user.id, { export_bg_ok: body.bg_ok });
      return Response.json({ ok: true, written, failed, cleared, removed, on_phone: there });
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
      on_phone: links.filter((l: any) => l.status === 'on_phone').length,
      removed_on_phone: links.filter((l: any) => l.status === 'removed_on_phone').length,
      other_device: !!(body.device && user.export_device && String(body.device) !== user.export_device),
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
    export_member_ids: Array.isArray(u.export_member_ids) ? u.export_member_ids : [],
    export_device: u.export_device || '',
    event_sharing_default: sharingMode(u),
  };
}

// How it repeats, for the phone. Android reads a bare end date as that day's
// first moment and drops the last time, so a timed series gets the end of
// that day spelled out in UTC (what the calendar standard asks for); an
// all-day series and the iPhone (which reads the day itself) keep the day.
function phoneRule(a: any, allDay: boolean, zone: string, platform: string) {
  const raw = String(a.recurrence || '').replace(/^RRULE:/i, '').trim();
  if (!raw || allDay || platform === 'ios') return raw;
  return raw.replace(/UNTIL=(\d{4})(\d{2})(\d{2})(?=;|$)/i, (_m: string, y: string, mo: string, d: string) => {
    const ms = localToMs(`${y}-${mo}-${d}`, '23:59', zone) + 59_000;
    return `UNTIL=${new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
  });
}

// When it's over for good (epoch ms), or 0 while it's still going: a
// one-time event's end; a series with an end date or a count, its last time.
function seriesEnds(a: any, allDay: boolean, zone: string, durMs: number, endMs: number, from: string, to: string) {
  if (!a.recurrence) return endMs;
  const rule = parseRRule(a.recurrence);
  if (!rule || (!rule.until && !rule.count)) return 0;
  const occ = expandAppointments([a], from, to);
  if (!occ.length) return 1;
  const last = occ[occ.length - 1].date;
  if (last >= addDays(to, -1)) return 0;
  return (allDay ? utcDay(last) : localToMs(last, a.time, zone)) + durMs;
}

import { base44 } from '@/api/base44Client';
import { track } from '@/lib/activity';
import { plugin, isIPhoneApp } from '@/lib/phone';
import { queryClientInstance } from '@/lib/query-client';
import { reloadWidgets } from '@/lib/widgets';
import { parseISO } from 'date-fns';
import { expandAppointments } from '@/lib/occurrences';
import { alreadyThere, byDay, nameSet } from '@/lib/phoneMatch';

// Phone calendars, both ways (Android app only; the browser has no phone
// calendar, so everything here is a no-op there). Ported from ADHDone's
// calendarSync.js and extended with export.
//
//   Import: the calendars the person ticked are read off the phone
//           (CalendarBridge.listEvents) and handed to functions/phoneCalendar
//           ("import"), which turns them into appointments. The phone also does
//           this on its own with the app closed (CalendarSyncWorker), so the
//           read here is a back-up at most every 10 minutes.
//   Export: functions/phoneCalendar ("export_pull") says which family events
//           belong on this phone (shared with them, from the people they
//           picked) and where. Before writing, the app reads the phone
//           (runExport): what's already there their own way is left off, one
//           they deleted from the phone stays deleted, and a copy GenCare wrote
//           earlier is updated rather than added again. Then the phone writes
//           (CalendarBridge.writeEvents) and it reports back. One phone per
//           person does this (exportDevice), so nothing goes on twice.

const IMPORT_GATE_KEY = 'gencare_phone_import_at';
const EXPORT_GATE_KEY = 'gencare_phone_export_at';
const IMPORT_GATE_MS = 3 * 60000; // on open/return; the Sync button skips the wait
const EXPORT_GATE_MS = 2 * 60000;
const DEVICE_DAYS = 365;

export const PERMISSION_LOST_KEY = 'gencare_calendar_permission_lost';

let importInFlight = null;
let exportInFlight = null;
let exportAgain = false; // a change came in while a run was going: run once more after it

const bridge = () => plugin('CalendarBridge');
export const hasPhoneCalendars = () => !!bridge();

const isHolidayFeed = (c) =>
  /#holiday@group\.v\.calendar\.google\.com$/i.test(String(c?.owner || '')) ||
  /^holidays? in /i.test(String(c?.name || '').trim());

export async function listDeviceCalendars() {
  const B = bridge();
  if (!B?.listCalendars) return { granted: false, calendars: [] };
  try {
    const res = await B.listCalendars();
    return { granted: !!res?.granted, calendars: (res?.calendars || []).filter((c) => !isHolidayFeed(c)) };
  } catch (e) {
    return { granted: false, calendars: [] };
  }
}

export async function listWritableCalendars() {
  const B = bridge();
  if (!B?.listWritableCalendars) return { granted: false, calendars: [] };
  try {
    const res = await B.listWritableCalendars();
    return { granted: !!res?.granted, calendars: (res?.calendars || []).filter((c) => !isHolidayFeed(c)) };
  } catch (e) {
    return { granted: false, calendars: [] };
  }
}

export async function requestReadPermission() {
  const B = bridge();
  if (!B?.requestPermissions) return false;
  try {
    const res = await B.requestPermissions({ permissions: ['calendar'] });
    track('permission', 'phone calendar (read)', String(res?.calendar || 'unknown'));
    return res?.calendar === 'granted';
  } catch (e) {
    return false;
  }
}

export async function requestWritePermission() {
  const B = bridge();
  if (!B?.requestPermissions) return false;
  try {
    const res = await B.requestPermissions({ permissions: ['calendarWrite'] });
    track('permission', 'phone calendar (write)', String(res?.calendarWrite || 'unknown'));
    return res?.calendarWrite === 'granted';
  } catch (e) {
    return false;
  }
}

// This phone, as far as GenCare is concerned: a random id kept on it, so the
// server knows which of a person's phones writes the family's events.
const DEVICE_KEY = 'gencare_device_id';
export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    return '';
  }
}
const platformName = () => (isIPhoneApp() ? 'ios' : 'android');
const hereTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };

/** Is this the phone that puts the family's events on the calendar? (No phone picked yet counts as yes.) */
export const exportsHere = (settings) => !settings?.export_device || settings.export_device === deviceId();

// Tells the phone what to do with the app closed (CalendarSyncWorker).
export function handPhoneSettings(settings) {
  const B = bridge();
  if (!B) return;
  const ids = (settings?.device_calendar_ids || []).map(String).filter(Boolean);
  try { Promise.resolve(B.setSyncCalendars?.({ calendarIds: ids })).catch(() => {}); } catch (e) { /* older build */ }
  // Only the phone that writes the family's events does it with the app closed.
  const on = !!settings?.export_enabled && !!settings?.export_calendar_id && exportsHere(settings);
  try { Promise.resolve(B.setExportEnabled?.({ enabled: on })).catch(() => {}); } catch (e) { /* older build */ }
}

export async function saveCalendarSettings(patch) {
  const res = await base44.functions.invoke('phoneCalendar', { mode: 'settings', ...patch, device: deviceId(), platform: platformName() });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not save');
  handPhoneSettings(data.settings);
  return data.settings;
}

export async function calendarStatus() {
  const res = await base44.functions.invoke('phoneCalendar', { mode: 'status', device: deviceId() });
  return res?.data || res;
}

function gated(key, ms) {
  const last = Number(localStorage.getItem(key) || 0);
  return Date.now() - last < ms;
}

// Reads the ticked calendars and imports them. Joins a run in progress.
export function runImport(calendarIds, { force = false } = {}) {
  if (importInFlight) return importInFlight;
  const ids = (calendarIds || []).map(String).filter(Boolean);
  const B = bridge();
  if (!B?.listEvents || !ids.length) return Promise.resolve(null);
  if (!force && gated(IMPORT_GATE_KEY, IMPORT_GATE_MS)) return Promise.resolve(null);
  localStorage.setItem(IMPORT_GATE_KEY, String(Date.now()));
  importInFlight = (async () => {
    const read = await B.listEvents({ calendarIds: ids, days: DEVICE_DAYS });
    if (!read?.granted) {
      track('error', 'phone calendar import', 'calendar permission missing');
      localStorage.setItem(PERMISSION_LOST_KEY, '1');
      const err = new Error('calendar_permission');
      err.code = 'calendar_permission';
      throw err;
    }
    localStorage.removeItem(PERMISSION_LOST_KEY);
    const res = await base44.functions.invoke('phoneCalendar', { mode: 'import', source: 'device', calendarIds: ids, rows: read.events || [] });
    const out = res?.data || res;
    track(out?.ok ? 'action' : 'error', 'phone calendar import', out?.ok ? `${(read.events || []).length} events from ${ids.length} calendar(s)` : String(out?.error || 'failed'));
    // Whatever page is open shows the new events now, not on the next visit.
    if (out?.ok) refreshEvents();
    return out;
  })().finally(() => { importInFlight = null; });
  return importInFlight;
}

// "Who sees the events you add": saved, applied to this person's imports
// that GenCare (not they) set the sharing on, then their unsorted imports get
// sorted in the background.
export async function saveSharingDefault(value) {
  track('action', 'choose:event sharing', value);
  const settings = await saveCalendarSettings({ event_sharing_default: value });
  refreshEvents();
  base44.functions.invoke('phoneCalendar', { mode: 'sort_imports' }).then(() => refreshEvents()).catch(() => {});
  return settings;
}

export function refreshEvents() {
  try { queryClientInstance.invalidateQueries({ queryKey: ['appointments'] }); } catch (e) { /* no cache yet */ }
  reloadWidgets();
}

// A calendar was unticked: its events leave GenCare (ones the person shared
// or gave a "For" stay). Works when the last calendar is unticked too.
export async function pruneImports() {
  const res = await base44.functions.invoke('phoneCalendar', { mode: 'prune' });
  refreshEvents();
  return res?.data || res;
}

const isBirthdayRow = (r) => /birthday/i.test(String(r?.calendarName || '')) || /\b(birthday|bday|b-day)\b/i.test(String(r?.title || ''));

/**
 * What's coming up in each phone calendar, so the person can tell which one
 * holds what: { [calendarId]: { count, next: { title, start, allDay } } } for
 * the next `days` days. Birthdays don't count (they aren't brought in).
 */
export async function peekCalendars(calendarIds, days = 30) {
  const B = bridge();
  const ids = (calendarIds || []).map(String).filter(Boolean);
  if (!B?.listEvents || !ids.length) return {};
  try {
    const read = await B.listEvents({ calendarIds: ids, days });
    if (!read?.granted) return {};
    const now = Date.now();
    const out = {};
    for (const r of read.events || []) {
      if (isBirthdayRow(r)) continue;
      const start = Number(r.nextBegin) || Number(r.dtstart) || 0;
      const end = Number(r.nextEnd) || Number(r.dtend) || start;
      if (!start || end < now - 86400000) continue;
      const cal = String(r.calendarId || '');
      const slot = (out[cal] ||= { count: 0, next: null });
      slot.count++;
      if (!slot.next || start < slot.next.start) slot.next = { title: String(r.title || '').trim() || 'Untitled event', start, allDay: !!r.allDay };
    }
    return out;
  } catch (e) {
    return {};
  }
}

// ---- Export: a look at the phone first --------------------------------------

const MARK = 'Added from GenCare'; // the last line of every event GenCare writes
const READ_DAYS = 370;
const ANDROID_CAP = 2400; // Android's reader stops at 2500 events; near that, the far end wasn't read
const isOurs = (r) => String(r?.description || '').trim().split(/\r?\n/).pop()?.trim() === MARK;
const baseId = (id) => String(id || '').split('#')[0];
const pad = (n) => String(n).padStart(2, '0');
const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const utcDayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const utcMs = (day) => { const [y, m, d] = String(day).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDayStr = (day, n) => { const d = parseISO(day); d.setDate(d.getDate() + n); return localDay(d.getTime()); };

// A day and clock time in a time zone -> epoch ms (the server's localToMs).
function zonedMs(date, time, tz) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  if (!y || !m || !d) return 0;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(guess))) p[x.type] = x.value;
    const asTz = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return guess - (asTz - guess);
  } catch (e) {
    return new Date(`${date}T${time || '00:00'}:00`).getTime();
  }
}

// Each time a phone event happens in the coming months (a series: up to 60 of them).
function rowTimes(r, today) {
  const allDay = !!r.allDay;
  const begin = Number(r.nextBegin) || Number(r.dtstart) || 0;
  if (!begin) return [];
  const one = (ms) => ({ day: allDay ? utcDayOf(ms) : localDay(ms), startMs: ms, allDay, title: r.title, location: r.location });
  const out = [one(begin)];
  if (r.rrule) {
    const first = Number(r.dtstart) || begin;
    const date = allDay ? utcDayOf(first) : localDay(first);
    const time = allDay ? '' : localTime(first);
    const series = { id: 'phone', date, time, all_day: allDay, recurrence: `RRULE:${String(r.rrule).replace(/^RRULE:/i, '')}` };
    for (const o of expandAppointments([series], parseISO(today), parseISO(addDayStr(today, 400))).slice(0, 60)) {
      const ms = allDay ? utcMs(o.date) : new Date(`${o.date}T${time}:00`).getTime();
      if (ms !== begin) out.push(one(ms));
    }
  }
  return out;
}

// Each time a GenCare event happens: a one-time event once; a series its next 8.
function eventTimes(e, today) {
  const c = e.check || {};
  const one = (day, ms) => ({ day, startMs: ms, allDay: !!e.allDay, title: c.title || e.title, location: e.location, who: c.who || '' });
  if (!c.recurrence) return [one(c.date || (e.allDay ? utcDayOf(e.startMs) : localDay(e.startMs)), e.startMs)];
  const series = { id: e.key, date: c.date, time: c.time, all_day: !!e.allDay, end_date: c.end_date, recurrence: c.recurrence };
  return expandAppointments([series], parseISO(today), parseISO(addDayStr(today, 400)))
    .filter((o) => !o.span_index)
    .slice(0, 8)
    .map((o) => one(o.date, e.allDay ? utcMs(o.date) : zonedMs(o.date, c.time, c.tz)));
}

// Reads the phone: the calendar GenCare writes into (what of GenCare's is
// still there) and every other one (what the person already has). Null when
// it can't (no permission): then nothing new is written.
async function readPhone(B, calendarId) {
  const iphone = isIPhoneApp();
  const mine = await B.listEvents({ calendarIds: [calendarId], days: READ_DAYS });
  if (!mine?.granted) return null;
  let rest = [];
  if (iphone) {
    // An empty list reads every calendar on an iPhone, holidays and birthdays too.
    const all = await B.listEvents({ calendarIds: [], days: READ_DAYS });
    if (!all?.granted) return null;
    rest = (all.events || []).filter((r) => String(r.calendarId) !== calendarId);
  } else {
    const cals = await B.listCalendars().catch(() => null);
    if (!cals?.granted) return null;
    // Hidden calendars don't show on the phone, so a copy there isn't a duplicate anyone sees.
    const ids = (cals.calendars || []).filter((c) => c.visible !== false && String(c.id) !== calendarId).map((c) => String(c.id));
    if (ids.length) {
      const all = await B.listEvents({ calendarIds: ids, days: READ_DAYS });
      if (!all?.granted) return null;
      rest = all.events || [];
    }
  }
  const now = Date.now();
  // How far each read really reaches (Android's stops at about 2,500 events).
  const reach = (rows) => (!iphone && rows.length >= ANDROID_CAP ? Math.max(...rows.map((r) => Number(r.nextBegin) || 0)) : now + READ_DAYS * 86400000);
  const own = mine.events || [];
  return {
    own, rest,
    // The iPhone's reader starts a week back, Android's at this moment.
    from: iphone ? now - 7 * 86400000 : now,
    reachOwn: reach(own),
    reachAll: Math.min(reach(own), reach(rest)),
  };
}

// What to write, and what to leave off and why.
function decide(plan, look) {
  const today = localDay(Date.now());
  const ours = new Set((plan.ours || []).map(String));
  const dropping = new Set((plan.deletes || []).map(String));
  const names = nameSet(plan.names || []);
  const ticked = new Set((plan.ticked || []).map(String));

  // GenCare's rows still on the phone, and ones it wrote that it lost track of
  // (the answer never got back, or an iPhone renumbered the event).
  const present = new Set();
  const pool = [];
  for (const r of look.own) {
    present.add(String(r.id)); present.add(baseId(r.id));
    if (r.originalId) present.add(String(r.originalId));
    if (isOurs(r) && !r.originalId && !ours.has(baseId(r.id)) && !dropping.has(String(r.id))) pool.push(r);
  }
  // Everything that's the person's own (any calendar).
  const theirs = [...look.own, ...look.rest].filter((r) => !isOurs(r) && !ours.has(baseId(r.id)) && !ours.has(String(r.originalId || '')));

  const taken = new Set();
  const titleCount = new Map();
  for (const e of [...(plan.events || []), ...(plan.watch || [])]) titleCount.set(e.title, (titleCount.get(e.title) || 0) + 1);
  const adopt = (e) => {
    const start = (r) => Number(r.dtstart) || Number(r.nextBegin) || 0;
    const free = pool.filter((r) => !taken.has(String(r.id)));
    let hit = free.find((r) => String(r.title) === e.title && Math.abs(start(r) - e.startMs) < 60000)
      || (e.prevSig ? free.find((r) => `${start(r)}|${r.title}` === e.prevSig) : null);
    if (!hit && titleCount.get(e.title) === 1) {
      const same = free.filter((r) => String(r.title) === e.title);
      if (same.length === 1) hit = same[0];
    }
    if (hit) taken.add(String(hit.id));
    return hit ? String(hit.id) : '';
  };

  const write = [];
  const skipped = [];
  const fresh = [];
  const relinked = [];
  // GenCare's copies with nothing new: still there? Deleted ones are noted now.
  for (const e of plan.watch || []) {
    if (present.has(String(e.deviceEventId))) continue;
    if (e.endsMs && e.endsMs <= look.from) continue;
    if (e.startMs > look.reachOwn) continue;
    const id = adopt(e);
    // Renumbered by the phone: the same row, nothing to write.
    if (id) relinked.push({ key: e.key, ok: true, deviceEventId: id, adopted: true, hash: e.hash, sig: `${e.startMs}|${e.title}` });
    else skipped.push({ key: e.key, why: 'removed_on_phone' });
  }
  // First, GenCare's own copies: kept, found again, or deleted by the person.
  for (const e of plan.events || []) {
    if (e.removed) {
      // Deleted from the phone; only taken back if it's really still there under a new number.
      const id = adopt(e);
      if (id) write.push({ ...e, deviceEventId: id, adopted: true });
      continue;
    }
    if (e.deviceEventId) {
      if (present.has(String(e.deviceEventId))) { write.push(e); continue; }
      if (e.endsMs && e.endsMs <= look.from) { skipped.push({ key: e.key, why: 'past', hash: e.hash }); continue; }
      if (e.startMs > look.reachOwn) continue; // too far out to see yet; next time
      const id = adopt(e);
      if (id) write.push({ ...e, deviceEventId: id, adopted: true });
      else skipped.push({ key: e.key, why: 'removed_on_phone' });
      continue;
    }
    // New on this phone. A copy GenCare already wrote (its answer got lost)?
    const id = adopt(e);
    if (id) write.push({ ...e, deviceEventId: id, adopted: true });
    else fresh.push(e);
  }
  // Then what's new: not if it's already there. GenCare copies nobody here
  // tracks count as there too (a calendar shared with someone else in the
  // family whose GenCare writes into it).
  const there = byDay([...theirs, ...pool.filter((r) => !taken.has(String(r.id)))].flatMap((r) => rowTimes(r, today)));
  for (const e of fresh) {
    const times = eventTimes(e, today).filter((o) => o.startMs <= look.reachAll);
    if (!times.length) continue; // beyond what the phone could show; next time
    if (alreadyThere(times, there, names)) { skipped.push({ key: e.key, why: 'on_phone', skipHash: e.skipHash }); continue; }
    write.push(e);
  }
  // With the app closed, the phone's own sync can only check what GenCare
  // brought in: fine when every timed event on the phone is in a calendar
  // that's brought in.
  const bgOk = !theirs.some((r) => !r.allDay && !ticked.has(String(r.calendarId)) && !/birthday/i.test(String(r.calendarName || '')));
  return { write, skipped, relinked, bgOk };
}

const NATIVE = ['key', 'title', 'description', 'location', 'startMs', 'endMs', 'allDay', 'timezone', 'reminderMinutes', 'rrule', 'deviceEventId', 'hash'];
const forPhone = (e) => Object.fromEntries(NATIVE.map((k) => [k, e[k]]));

// Pulls what belongs on this phone, looks at the phone, writes, reports back.
export function runExport({ force = false } = {}) {
  if (exportInFlight) { if (force) exportAgain = true; return exportInFlight; }
  const B = bridge();
  if (!B?.writeEvents) return Promise.resolve(null);
  if (!force && gated(EXPORT_GATE_KEY, EXPORT_GATE_MS)) return Promise.resolve(null);
  localStorage.setItem(EXPORT_GATE_KEY, String(Date.now()));
  exportInFlight = (async () => {
    const pull = await base44.functions.invoke('phoneCalendar', { mode: 'export_pull', v: 2, device: deviceId(), platform: platformName(), timezone: hereTz() || undefined });
    const plan = pull?.data || pull;
    if (!plan?.ok) return plan;
    if (plan.other_device) {
      // GenCare reinstalled on the same phone (a new phone id, but GenCare's own
      // events are right where they were written)? Then it carries on here.
      if (plan.probeCalendarId && (plan.probe || []).length) {
        const seen = await B.listEvents({ calendarIds: [String(plan.probeCalendarId)], days: READ_DAYS }).catch(() => null);
        const rows = new Map((seen?.events || []).filter(isOurs).map((r) => [String(r.id), r]));
        const same = plan.probe.some((p) => { const r = rows.get(String(p.id)); return r && `${Number(r.dtstart) || 0}|${r.title}` === p.sig; });
        if (same) {
          await saveCalendarSettings({ export_here: true, same_phone: true }).catch(() => null);
          exportAgain = true;
          return { ok: true, same_phone: true };
        }
      }
      // Another of their phones writes the family's events; this one stays out of it.
      try { Promise.resolve(B.setExportEnabled?.({ enabled: false })).catch(() => {}); } catch (e) { /* older build */ }
      return { ok: true, other_device: true };
    }
    const deletes = (plan.deletes || []).map(String);
    let write = [];
    let skipped = [];
    let relinked = [];
    let bgOk;
    if (plan.exporting && plan.calendarId) {
      // Only into a calendar this phone has (one picked on another phone could
      // be a different calendar here).
      const w = await listWritableCalendars();
      if (w.granted && !w.calendars.some((c) => String(c.id) === String(plan.calendarId))) {
        return { ok: false, error: 'calendar_gone' };
      }
      const look = await readPhone(B, String(plan.calendarId)).catch(() => null);
      if (!look) {
        // Can't see the phone's calendars: write nothing (it could double up), only take GenCare's own off.
        localStorage.setItem(PERMISSION_LOST_KEY, '1');
        if (!deletes.length) return { ok: false, error: 'calendar_permission' };
      } else {
        ({ write, skipped, relinked, bgOk } = decide(plan, look));
      }
    }
    if (!write.length && !deletes.length && !skipped.length && !relinked.length && (bgOk === undefined || bgOk === !!plan.bg_ok)) return { ok: true, written: 0, deleted: 0 };
    let results = [...relinked];
    if (write.length) {
      const w = await B.writeEvents({ calendarId: String(plan.calendarId), events: write.map(forPhone) });
      if (!w?.granted) {
        localStorage.setItem(PERMISSION_LOST_KEY, '1');
        return { ok: false, error: 'calendar_permission' };
      }
      const byKey = new Map(write.map((e) => [e.key, e]));
      results = [...results, ...(w.results || []).map((r) => ({ ...r, adopted: !!byKey.get(r.key)?.adopted, sig: byKey.get(r.key)?.sig || '' }))];
    }
    let deleted = [];
    if (deletes.length) {
      const d = await B.deleteEvents({ deviceEventIds: deletes });
      if (d?.granted) deleted = deletes;
    }
    const hashes = {};
    for (const e of write) hashes[e.key] = e.hash;
    const rep = await base44.functions.invoke('phoneCalendar', { mode: 'export_report', v: 2, results, deleted, hashes, skipped, bg_ok: bgOk });
    track('action', 'phone calendar export', `${results.filter((r) => r.ok).length} written, ${deleted.length} removed, ${skipped.filter((x) => x.why === 'on_phone').length} already there`);
    return rep?.data || rep;
  })().finally(() => {
    exportInFlight = null;
    if (exportAgain) { exportAgain = false; runExport({ force: true }).catch(() => null); }
  });
  return exportInFlight;
}

// On every app open / return to the app.
export async function syncOnOpen(user) {
  if (!hasPhoneCalendars() || !user) return;
  handPhoneSettings(user);
  const ids = Array.isArray(user.device_calendar_ids) ? user.device_calendar_ids : [];
  if (ids.length) await runImport(ids).catch(() => null);
  if (user.export_enabled && user.export_calendar_id && exportsHere(user)) await runExport().catch(() => null);
}

// After the family calendar changed in the app: the person's own phone gets it now.
export function exportSoon() {
  reloadWidgets();
  if (!hasPhoneCalendars()) return;
  setTimeout(() => { runExport({ force: true }).catch(() => null); }, 1500);
}

// The Calendar page's Sync button: read the phone calendars and send the
// family's events to the phone right now, then show what changed.
export async function syncNow(user) {
  let imported = null;
  if (hasPhoneCalendars() && user) {
    handPhoneSettings(user);
    const ids = Array.isArray(user.device_calendar_ids) ? user.device_calendar_ids : [];
    if (ids.length) imported = await runImport(ids, { force: true });
    if (user.export_enabled && user.export_calendar_id && exportsHere(user)) await runExport({ force: true }).catch(() => null);
  }
  refreshEvents();
  track('action', 'calendar:sync button', imported ? 'phone read' : 'refresh only');
  return imported;
}

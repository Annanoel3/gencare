import { base44 } from '@/api/base44Client';
import { plugin } from '@/lib/phone';

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
//           belong on this phone (the person's own filter) and where; the phone
//           writes them (CalendarBridge.writeEvents) and reports back.

const IMPORT_GATE_KEY = 'gencare_phone_import_at';
const EXPORT_GATE_KEY = 'gencare_phone_export_at';
const IMPORT_GATE_MS = 10 * 60000;
const EXPORT_GATE_MS = 2 * 60000;
const DEVICE_DAYS = 365;

export const PERMISSION_LOST_KEY = 'gencare_calendar_permission_lost';

let importInFlight = null;
let exportInFlight = null;

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
    return res?.calendarWrite === 'granted';
  } catch (e) {
    return false;
  }
}

// Tells the phone what to do with the app closed (CalendarSyncWorker).
export function handPhoneSettings(settings) {
  const B = bridge();
  if (!B) return;
  const ids = (settings?.device_calendar_ids || []).map(String).filter(Boolean);
  try { Promise.resolve(B.setSyncCalendars?.({ calendarIds: ids })).catch(() => {}); } catch (e) { /* older build */ }
  try { Promise.resolve(B.setExportEnabled?.({ enabled: !!settings?.export_enabled && !!settings?.export_calendar_id })).catch(() => {}); } catch (e) { /* older build */ }
}

export async function saveCalendarSettings(patch) {
  const res = await base44.functions.invoke('phoneCalendar', { mode: 'settings', ...patch });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not save');
  handPhoneSettings(data.settings);
  return data.settings;
}

export async function calendarStatus() {
  const res = await base44.functions.invoke('phoneCalendar', { mode: 'status' });
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
      localStorage.setItem(PERMISSION_LOST_KEY, '1');
      const err = new Error('calendar_permission');
      err.code = 'calendar_permission';
      throw err;
    }
    localStorage.removeItem(PERMISSION_LOST_KEY);
    const res = await base44.functions.invoke('phoneCalendar', { mode: 'import', source: 'device', calendarIds: ids, rows: read.events || [] });
    return res?.data || res;
  })().finally(() => { importInFlight = null; });
  return importInFlight;
}

// Pulls what belongs on this phone, writes it, reports back.
export function runExport({ force = false } = {}) {
  if (exportInFlight) return exportInFlight;
  const B = bridge();
  if (!B?.writeEvents) return Promise.resolve(null);
  if (!force && gated(EXPORT_GATE_KEY, EXPORT_GATE_MS)) return Promise.resolve(null);
  localStorage.setItem(EXPORT_GATE_KEY, String(Date.now()));
  exportInFlight = (async () => {
    const pull = await base44.functions.invoke('phoneCalendar', { mode: 'export_pull' });
    const plan = pull?.data || pull;
    if (!plan?.ok) return plan;
    const events = plan.events || [];
    const deletes = plan.deletes || [];
    if (!events.length && !deletes.length) return { ok: true, written: 0, deleted: 0 };
    let results = [];
    if (plan.calendarId && events.length) {
      const w = await B.writeEvents({ calendarId: String(plan.calendarId), events });
      if (!w?.granted) {
        localStorage.setItem(PERMISSION_LOST_KEY, '1');
        return { ok: false, error: 'calendar_permission' };
      }
      results = w.results || [];
    }
    let deleted = [];
    if (deletes.length) {
      const d = await B.deleteEvents({ deviceEventIds: deletes });
      if (d?.granted) deleted = deletes;
    }
    const hashes = {};
    for (const e of events) hashes[e.key] = e.hash;
    const rep = await base44.functions.invoke('phoneCalendar', { mode: 'export_report', results, deleted, hashes });
    return rep?.data || rep;
  })().finally(() => { exportInFlight = null; });
  return exportInFlight;
}

// On every app open / return to the app.
export async function syncOnOpen(user) {
  if (!hasPhoneCalendars() || !user) return;
  handPhoneSettings(user);
  const ids = Array.isArray(user.device_calendar_ids) ? user.device_calendar_ids : [];
  if (ids.length) await runImport(ids).catch(() => null);
  if (user.export_enabled && user.export_calendar_id) await runExport().catch(() => null);
}

// After the family calendar changed in the app: the person's own phone gets it now.
export function exportSoon() {
  if (!hasPhoneCalendars()) return;
  setTimeout(() => { runExport({ force: true }).catch(() => null); }, 1500);
}

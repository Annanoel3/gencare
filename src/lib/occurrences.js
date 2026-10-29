import { parseISO, isValid, format, addDays, differenceInCalendarDays, startOfDay } from 'date-fns';

// Repeating and multi-day events. An Appointment row is ONE event; a repeating
// one carries an RRULE (phone imports write it, EventDialog writes the simple
// ones) and a multi-day one carries end_date. The calendar, the home feed and
// the reminder job all ask this file "which events are on these days?" and get
// one occurrence per day, each a copy of the row with `date` set to that day
// and `occurrence_of` pointing at the row (so editing it edits the series).
//
// Twin of base44/shared/recurrence.ts (Deno) — change both together.

const DAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRRule(rule) {
  if (!rule) return null;
  const body = String(rule).replace(/^RRULE:/i, '').trim();
  if (!body) return null;
  const out = { freq: '', interval: 1, byday: [], until: null, count: null };
  for (const part of body.split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case 'FREQ': out.freq = v.toUpperCase(); break;
      case 'INTERVAL': out.interval = Math.max(1, parseInt(v, 10) || 1); break;
      case 'BYDAY': out.byday = v.split(',').map((d) => DAY_CODES[d.replace(/^[-+]?\d+/, '').toUpperCase()]).filter((n) => n !== undefined); break;
      case 'UNTIL': {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
        if (m) out.until = new Date(+m[1], +m[2] - 1, +m[3]);
        break;
      }
      case 'COUNT': out.count = parseInt(v, 10) || null; break;
      default: break;
    }
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(out.freq)) return null;
  return out;
}

/** The simple repeat choices the app offers, as RRULEs. */
export const EVENT_REPEATS = [
  { value: '', label: 'Does not repeat' },
  { value: 'RRULE:FREQ=DAILY', label: 'Every day' },
  { value: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
  { value: 'RRULE:FREQ=WEEKLY', label: 'Every week' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=2', label: 'Every other week' },
  { value: 'RRULE:FREQ=MONTHLY', label: 'Every month' },
  { value: 'RRULE:FREQ=YEARLY', label: 'Every year' },
];

// "Every week" / "Mon, Wed" plus its last day when it has one ("… until Dec 1").
export function repeatLabel(rule) {
  const r = parseRRule(rule);
  if (!r) return '';
  const words = repeatWords(r);
  if (!r.until) return words;
  const sameYear = r.until.getFullYear() === new Date().getFullYear();
  return `${words} until ${format(r.until, sameYear ? 'MMM d' : 'MMM d, yyyy')}`;
}
function repeatWords(r) {
  const base = r.freq === 'DAILY' ? 'day' : r.freq === 'WEEKLY' ? 'week' : r.freq === 'MONTHLY' ? 'month' : 'year';
  if (r.freq === 'WEEKLY' && r.byday.length && r.interval === 1) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = r.byday.map((n) => names[n]);
    if (d.length === 5 && !r.byday.includes(0) && !r.byday.includes(6)) return 'Weekdays';
    return d.join(', ');
  }
  return r.interval === 1 ? `Every ${base}` : `Every ${r.interval} ${base}s`;
}

const dayStr = (d) => format(d, 'yyyy-MM-dd');

/**
 * Does the series starting on `start` land on `day`? Pure arithmetic per
 * frequency, so a year of a daily event costs nothing to check.
 */
function seriesHits(r, start, day) {
  if (day < start) return false;
  if (r.until && day > r.until) return false;
  const days = differenceInCalendarDays(day, start);
  switch (r.freq) {
    case 'DAILY':
      return days % r.interval === 0 && (!r.count || days / r.interval < r.count);
    case 'WEEKLY': {
      const set = r.byday.length ? r.byday : [start.getDay()];
      if (!set.includes(day.getDay())) return false;
      const weeks = Math.floor((days + start.getDay()) / 7);
      return weeks % r.interval === 0;
    }
    case 'MONTHLY': {
      if (day.getDate() !== start.getDate()) return false;
      const months = (day.getFullYear() - start.getFullYear()) * 12 + (day.getMonth() - start.getMonth());
      return months % r.interval === 0 && (!r.count || months / r.interval < r.count);
    }
    case 'YEARLY': {
      if (day.getDate() !== start.getDate() || day.getMonth() !== start.getMonth()) return false;
      const years = day.getFullYear() - start.getFullYear();
      return years % r.interval === 0 && (!r.count || years / r.interval < r.count);
    }
    default: return false;
  }
}

function spanDays(a) {
  if (!a.end_date || a.end_date <= a.date) return 0;
  const s = parseISO(a.date), e = parseISO(a.end_date);
  if (!isValid(s) || !isValid(e)) return 0;
  return Math.max(0, Math.min(60, differenceInCalendarDays(e, s)));
}

/**
 * Every occurrence of `appointments` between rangeStart and rangeEnd (Dates,
 * inclusive), one per day. Multi-day events appear on each day of their span
 * (`span_index` 0 = first day). Repeating events get `occurrence_of`.
 */
export function expandAppointments(appointments, rangeStart, rangeEnd) {
  const out = [];
  const from = startOfDay(rangeStart);
  const to = startOfDay(rangeEnd);
  const ndays = differenceInCalendarDays(to, from);
  if (ndays < 0) return out;
  for (const a of appointments || []) {
    if (!a?.date) continue;
    const start = parseISO(a.date);
    if (!isValid(start)) continue;
    const rule = parseRRule(a.recurrence);
    const span = spanDays(a);
    if (!rule) {
      // One event, maybe spanning days.
      for (let i = 0; i <= span; i++) {
        const d = addDays(start, i);
        if (d < from || d > to) continue;
        out.push(span ? { ...a, date: dayStr(d), span_index: i, span_days: span + 1 } : a);
      }
      continue;
    }
    // A series: test each day of the range (plus the days a span can reach back from).
    for (let i = -span; i <= ndays; i++) {
      const d = addDays(from, i);
      if (!seriesHits(rule, startOfDay(start), d)) continue;
      for (let j = 0; j <= span; j++) {
        const dd = addDays(d, j);
        if (dd < from || dd > to) continue;
        out.push({ ...a, date: dayStr(dd), occurrence_of: a.id, series_date: dayStr(d), span_index: span ? j : undefined, span_days: span ? span + 1 : undefined, id: `${a.id}@${dayStr(dd)}` });
      }
    }
  }
  return out;
}

/** Occurrences on one day. */
export function occurrencesOn(appointments, day) {
  return expandAppointments(appointments, day, day);
}

/** The row id behind an occurrence (for editing). */
export const rowIdOf = (occ) => occ?.occurrence_of || occ?.id;

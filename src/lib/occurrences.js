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
const CODE_OF = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A day of the week in BYDAY keeps its number (Anna, Nov 14 2026: "second
// tuesday of every month, third thursday, first monday, first sunday"):
// "2TU" is the second Tuesday, "-1FR" the last Friday, plain "MO" every Monday.
function dayEntry(code) {
  const m = /^([-+]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(String(code).trim());
  return m ? { wd: DAY_CODES[m[2].toUpperCase()], n: m[1] ? parseInt(m[1], 10) : 0 } : null;
}
const ints = (v) => String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n !== 0);

export function parseRRule(rule) {
  if (!rule) return null;
  const body = String(rule).replace(/^RRULE:/i, '').trim();
  if (!body) return null;
  // byday: the weekdays (0 = Sunday); days: the same with their numbers.
  const out = { freq: '', interval: 1, byday: [], days: [], monthdays: [], months: [], setpos: [], until: null, count: null };
  for (const part of body.split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case 'FREQ': out.freq = v.toUpperCase(); break;
      case 'INTERVAL': out.interval = Math.max(1, parseInt(v, 10) || 1); break;
      case 'BYDAY': out.days = v.split(',').map(dayEntry).filter(Boolean); out.byday = out.days.map((d) => d.wd); break;
      case 'BYMONTHDAY': out.monthdays = ints(v).filter((n) => Math.abs(n) <= 31); break;
      case 'BYMONTH': out.months = ints(v).filter((n) => n >= 1 && n <= 12); break;
      case 'BYSETPOS': out.setpos = ints(v); break;
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

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
/** Which of its kind in the month a day is: 1 for the first Tuesday, up to 5. */
export const weekOfMonth = (d) => Math.ceil(d.getDate() / 7);
/** The same, from the end: 1 when it's the last one of its kind. */
export const weekFromEnd = (d) => Math.ceil((daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1) / 7);

export const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last', '-2': 'second to last' };
const nth = (n) => ORDINAL[n] || `${n}`;
const numberth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const and = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

/** "the second Tuesday", "the last day", "the 15th" (what a monthly rule picks), or '' for its start date's day. */
function monthWords(r) {
  if (r.days.length) {
    const weekdays = r.days.length === 5 && [1, 2, 3, 4, 5].every((n) => r.byday.includes(n));
    if (r.setpos.length === 1 && r.days.every((e) => !e.n)) return `the ${nth(r.setpos[0])} ${weekdays ? 'weekday' : and(r.days.map((e) => WEEKDAY[e.wd]))}`;
    if (r.days.every((e) => e.n)) return `the ${and(r.days.map((e) => `${nth(e.n)} ${WEEKDAY[e.wd]}`))}`;
    return weekdays ? 'every weekday' : `every ${and(r.days.map((e) => WEEKDAY[e.wd]))}`;
  }
  if (r.monthdays.length) return `the ${and(r.monthdays.map((n) => (n === -1 ? 'last day' : n < 0 ? `${nth(n)} day` : numberth(n))))}`;
  return '';
}

// "Every week" / "Mon, Wed" / "Every month on the second Tuesday", plus its
// last day when it has one ("… until Dec 1").
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
  const every = r.interval === 1 ? `Every ${base}` : `Every ${r.interval} ${base}s`;
  if (r.freq === 'MONTHLY') {
    const on = monthWords(r);
    return on ? `${every} on ${on}` : every;
  }
  if (r.freq === 'YEARLY') {
    const on = monthWords(r);
    const months = r.months.length ? and(r.months.map((m) => MONTH[m - 1])) : '';
    if (on) return `${every} on ${on}${months ? ` of ${months}` : ''}`;
    return months ? `${every} in ${months}` : every;
  }
  return every;
}

/**
 * "Every month on the second Tuesday" for this day (a 'YYYY-MM-DD'), and
 * "… on the last Tuesday" when it's the last one, as repeat choices. A day
 * after the 28th is only ever the last one.
 */
export function monthlyWeekdayChoices(date) {
  const d = parseISO(String(date || ''));
  if (!isValid(d)) return [];
  const out = [];
  const n = weekOfMonth(d);
  if (n <= 4) out.push(monthlyWeekdayRule(d.getDay(), n));
  if (weekFromEnd(d) === 1) out.push(monthlyWeekdayRule(d.getDay(), -1));
  return out.map((value) => ({ value, label: repeatWords(parseRRule(value)) }));
}
/** RRULE for the nth (1-4, or -1 for the last) weekday (0 = Sunday) of every month. */
export const monthlyWeekdayRule = (wd, n) => `RRULE:FREQ=MONTHLY;BYDAY=${n}${CODE_OF[wd]}`;
/** { wd, n } when a rule is "every month on the nth weekday" (the kind the app writes), else null. */
export function monthlyWeekdayOf(rule) {
  const r = parseRRule(rule);
  if (!r || r.freq !== 'MONTHLY' || r.days.length !== 1 || !r.days[0].n || r.setpos.length || r.monthdays.length) return null;
  return { wd: r.days[0].wd, n: r.days[0].n };
}
/** The first day on or after `from` (a 'YYYY-MM-DD') that a rule lands on, as 'YYYY-MM-DD'. */
export function firstDayOf(rule, from) {
  const r = parseRRule(rule);
  const d0 = parseISO(String(from || ''));
  if (!r || !isValid(d0)) return from;
  for (let i = 0; i < 400; i++) {
    const d = addDays(startOfDay(d0), i);
    if (seriesHits({ ...r, until: null, count: null }, d, d)) return dayStr(d);
  }
  return from;
}

// "The ___ ___ of every month" (Anna, Nov 14 2026): the first blank is
// First / Second / Third / Fourth / Last or a day number (1st to 31st), the
// second is "day" or a day of the week. "The 14th day", "the last day", "the
// second Tuesday", "the last Friday". Events and to-dos both use these.
export const MONTHLY_FIRST = [
  ...[1, 2, 3, 4].map((n) => ({ value: `n${n}`, label: ORDINAL[n][0].toUpperCase() + ORDINAL[n].slice(1) })),
  { value: 'last', label: 'Last' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: `d${i + 1}`, label: numberth(i + 1) })),
];
export const MONTHLY_SECOND = [{ value: 'day', label: 'day' }, ...WEEKDAY.map((w, i) => ({ value: String(i), label: w }))];

/** The two blanks for an event's monthly rule on its day ('YYYY-MM-DD'), or null for any other kind of repeat. */
export function monthlyBlanks(rule, date) {
  const r = parseRRule(rule);
  if (!r || r.freq !== 'MONTHLY' || r.interval !== 1 || r.setpos.length || r.months.length) return null;
  const d = parseISO(String(date || ''));
  if (!r.days.length && !r.monthdays.length) return { first: `d${isValid(d) ? d.getDate() : 1}`, second: 'day' };
  if (!r.days.length && r.monthdays.length === 1) {
    const n = r.monthdays[0];
    return n === -1 ? { first: 'last', second: 'day' } : n > 0 ? { first: `d${n}`, second: 'day' } : null;
  }
  if (r.days.length === 1 && !r.monthdays.length) {
    const { wd, n } = r.days[0];
    if (n === -1) return { first: 'last', second: String(wd) };
    if (n >= 1 && n <= 4) return { first: `n${n}`, second: String(wd) };
  }
  return null;
}

/**
 * The blanks tidied to what they mean: First to Fourth with "day" is the 1st
 * to 4th, and a day number with a weekday becomes its week ("the 14th" +
 * Tuesday is the second Tuesday; the 29th to 31st, the last one).
 */
export function normalizeBlanks(first, second) {
  const num = parseInt(String(first).slice(1), 10) || 1;
  if (second === 'day') return { first: first === 'last' ? 'last' : `d${num}`, second };
  if (first === 'last' || first.startsWith('n')) return { first, second };
  return { first: num > 28 ? 'last' : `n${Math.ceil(num / 7)}`, second };
}
/** Two picks that mean the same repeat ("Third day" and "3rd day"). */
export const sameBlanks = (a, b) => !!a && !!b && (({ first, second }) => `${first}|${second}`)(normalizeBlanks(a.first, a.second)) === (({ first, second }) => `${first}|${second}`)(normalizeBlanks(b.first, b.second));

/**
 * The blanks as a repeat: its rule, its first day on or after `from`
 * ('YYYY-MM-DD'), and kind: 'day' (a day number, n), 'lastday', or 'weekday'
 * (wd, and n = 1-4 or -1 for the last one).
 */
export function monthlyFromBlanks(first, second, from) {
  const b = normalizeBlanks(first, second);
  const num = parseInt(b.first.slice(1), 10) || 1;
  let out;
  if (b.second === 'day') {
    out = b.first === 'last'
      ? { kind: 'lastday', rule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1', probe: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1' }
      : { kind: 'day', n: num, rule: 'RRULE:FREQ=MONTHLY', probe: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${num}` };
  } else {
    const wd = Number(b.second) || 0;
    const n = b.first === 'last' ? -1 : num;
    const rule = monthlyWeekdayRule(wd, n);
    out = { kind: 'weekday', wd, n, rule, probe: rule };
  }
  return { ...b, ...out, date: firstDayOf(out.probe, from) };
}

/** "Every month on the 14th" / "Every year on Nov 14" when the event's day says which; otherwise repeatLabel. */
export function repeatLabelOn(rule, date) {
  const r = parseRRule(rule);
  const d = parseISO(String(date || ''));
  if (r && isValid(d) && r.interval === 1 && !r.days.length && !r.monthdays.length && !r.months.length && !r.setpos.length && (r.freq === 'MONTHLY' || r.freq === 'YEARLY')) {
    const words = r.freq === 'MONTHLY' ? `Every month on the ${numberth(d.getDate())}` : `Every year on ${format(d, 'MMM d')}`;
    if (!r.until) return words;
    return `${words} until ${format(r.until, r.until.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy')}`;
  }
  return repeatLabel(rule);
}

const dayStr = (d) => format(d, 'yyyy-MM-dd');

/** Does a monthly rule pick this day of its month? (Also a yearly rule's month.) */
function pickedInMonth(r, start, day) {
  if (!r.days.length && !r.monthdays.length) return day.getDate() === start.getDate();
  const dim = daysInMonth(day.getFullYear(), day.getMonth());
  const fits = (d) => {
    if (r.days.length && !r.days.some((e) => e.wd === d.getDay() && (!e.n || (e.n > 0 ? weekOfMonth(d) === e.n : weekFromEnd(d) === -e.n)))) return false;
    if (r.monthdays.length && !r.monthdays.some((n) => (n > 0 ? n : dim + n + 1) === d.getDate())) return false;
    return true;
  };
  if (!r.setpos.length) return fits(day);
  // BYSETPOS: the nth of the days the rest picks ("the last weekday").
  const all = [];
  for (let i = 1; i <= dim; i++) if (fits(new Date(day.getFullYear(), day.getMonth(), i))) all.push(i);
  return r.setpos.some((p) => (p > 0 ? all[p - 1] : all[all.length + p]) === day.getDate());
}

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
      const set = r.byday.length ? [...new Set(r.byday)] : [start.getDay()];
      if (!set.includes(day.getDay())) return false;
      const weeks = Math.floor((days + start.getDay()) / 7);
      if (weeks % r.interval !== 0) return false;
      if (!r.count) return true;
      // How many there have been, this one included: the rest of the first
      // week from the start day, then each repeating week in full.
      const first = set.filter((d) => d >= start.getDay());
      const upTo = set.filter((d) => d <= day.getDay()).length;
      const n = weeks === 0 ? first.filter((d) => d <= day.getDay()).length : first.length + (weeks / r.interval - 1) * set.length + upTo;
      return n <= r.count;
    }
    case 'MONTHLY': {
      const months = (day.getFullYear() - start.getFullYear()) * 12 + (day.getMonth() - start.getMonth());
      if (months % r.interval !== 0 || !pickedInMonth(r, start, day)) return false;
      return !r.count || months / r.interval < r.count;
    }
    case 'YEARLY': {
      if (r.months.length ? !r.months.includes(day.getMonth() + 1) : day.getMonth() !== start.getMonth()) return false;
      const years = day.getFullYear() - start.getFullYear();
      if (years % r.interval !== 0 || !pickedInMonth(r, start, day)) return false;
      return !r.count || years / r.interval < r.count;
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

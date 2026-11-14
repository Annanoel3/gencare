// Repeating and multi-day events for the backend (Deno). Twin of
// src/lib/occurrences.js in the web app — change both together.
//
//   expandAppointments(rows, fromDay, toDay)  -> one occurrence per day, as
//   copies of the row with `date` set and `occurrence_of` = the row id.
//   Days are 'YYYY-MM-DD' strings in the family's own calendar; all the
//   arithmetic is on local calendar days, which is what an RRULE means.

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// byday: the weekdays (0 = Sunday); days: the same with their numbers, so
// "2TU" is the second Tuesday and "-1FR" the last Friday (Anna, Nov 14 2026).
export type Rule = {
  freq: string; interval: number; byday: number[]; days: { wd: number; n: number }[];
  monthdays: number[]; months: number[]; setpos: number[]; until: Date | null; count: number | null;
};

function dayEntry(code: string): { wd: number; n: number } | null {
  const m = /^([-+]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(String(code).trim());
  return m ? { wd: DAY_CODES[m[2].toUpperCase()], n: m[1] ? parseInt(m[1], 10) : 0 } : null;
}
const ints = (v: string) => String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n !== 0);

export function parseRRule(rule: string | null | undefined): Rule | null {
  if (!rule) return null;
  const body = String(rule).replace(/^RRULE:/i, '').trim();
  if (!body) return null;
  const out: Rule = { freq: '', interval: 1, byday: [], days: [], monthdays: [], months: [], setpos: [], until: null, count: null };
  for (const part of body.split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case 'FREQ': out.freq = v.toUpperCase(); break;
      case 'INTERVAL': out.interval = Math.max(1, parseInt(v, 10) || 1); break;
      case 'BYDAY': out.days = v.split(',').map(dayEntry).filter((d): d is { wd: number; n: number } => !!d); out.byday = out.days.map((d) => d.wd); break;
      case 'BYMONTHDAY': out.monthdays = ints(v).filter((n) => Math.abs(n) <= 31); break;
      case 'BYMONTH': out.months = ints(v).filter((n) => n >= 1 && n <= 12); break;
      case 'BYSETPOS': out.setpos = ints(v); break;
      case 'UNTIL': { const m = /^(\d{4})(\d{2})(\d{2})/.exec(v); if (m) out.until = new Date(+m[1], +m[2] - 1, +m[3]); break; }
      case 'COUNT': out.count = parseInt(v, 10) || null; break;
    }
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(out.freq)) return null;
  return out;
}

function toDate(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayDiff(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const weekOfMonth = (d: Date) => Math.ceil(d.getDate() / 7);
const weekFromEnd = (d: Date) => Math.ceil((daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1) / 7);

/** Does a monthly rule pick this day of its month? (Also a yearly rule's month.) */
function pickedInMonth(r: Rule, start: Date, day: Date): boolean {
  if (!r.days.length && !r.monthdays.length) return day.getDate() === start.getDate();
  const dim = daysInMonth(day.getFullYear(), day.getMonth());
  const fits = (d: Date) => {
    if (r.days.length && !r.days.some((e) => e.wd === d.getDay() && (!e.n || (e.n > 0 ? weekOfMonth(d) === e.n : weekFromEnd(d) === -e.n)))) return false;
    if (r.monthdays.length && !r.monthdays.some((n) => (n > 0 ? n : dim + n + 1) === d.getDate())) return false;
    return true;
  };
  if (!r.setpos.length) return fits(day);
  const all: number[] = [];
  for (let i = 1; i <= dim; i++) if (fits(new Date(day.getFullYear(), day.getMonth(), i))) all.push(i);
  return r.setpos.some((p) => (p > 0 ? all[p - 1] : all[all.length + p]) === day.getDate());
}

function seriesHits(r: Rule, start: Date, day: Date): boolean {
  if (day < start) return false;
  if (r.until && day > r.until) return false;
  const days = dayDiff(start, day);
  switch (r.freq) {
    case 'DAILY': return days % r.interval === 0 && (!r.count || days / r.interval < r.count);
    case 'WEEKLY': {
      const set = r.byday.length ? [...new Set(r.byday)] : [start.getDay()];
      if (!set.includes(day.getDay())) return false;
      const weeks = Math.floor((days + start.getDay()) / 7);
      if (weeks % r.interval !== 0) return false;
      if (!r.count) return true;
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
  }
  return false;
}

function spanDays(a: any): number {
  if (!a.end_date || a.end_date <= a.date) return 0;
  const s = toDate(a.date), e = toDate(a.end_date);
  if (!s || !e) return 0;
  return Math.max(0, Math.min(60, dayDiff(s, e)));
}

export function expandAppointments(rows: any[], fromDay: string, toDay: string): any[] {
  const out: any[] = [];
  const from = toDate(fromDay), to = toDate(toDay);
  if (!from || !to) return out;
  const ndays = dayDiff(from, to);
  if (ndays < 0) return out;
  for (const a of rows || []) {
    const start = toDate(a?.date);
    if (!start) continue;
    const rule = parseRRule(a.recurrence);
    const span = spanDays(a);
    if (!rule) {
      for (let i = 0; i <= span; i++) {
        const d = addDays(start, i);
        if (d < from || d > to) continue;
        out.push(span ? { ...a, date: dayStr(d), span_index: i, span_days: span + 1 } : a);
      }
      continue;
    }
    for (let i = -span; i <= ndays; i++) {
      const d = addDays(from, i);
      if (!seriesHits(rule, start, d)) continue;
      for (let j = 0; j <= span; j++) {
        const dd = addDays(d, j);
        if (dd < from || dd > to) continue;
        out.push({ ...a, date: dayStr(dd), occurrence_of: a.id, series_date: dayStr(d), row_id: a.id });
      }
    }
  }
  return out;
}

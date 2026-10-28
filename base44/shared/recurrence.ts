// Repeating and multi-day events for the backend (Deno). Twin of
// src/lib/occurrences.js in the web app — change both together.
//
//   expandAppointments(rows, fromDay, toDay)  -> one occurrence per day, as
//   copies of the row with `date` set and `occurrence_of` = the row id.
//   Days are 'YYYY-MM-DD' strings in the family's own calendar; all the
//   arithmetic is on local calendar days, which is what an RRULE means.

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export type Rule = { freq: string; interval: number; byday: number[]; until: Date | null; count: number | null };

export function parseRRule(rule: string | null | undefined): Rule | null {
  if (!rule) return null;
  const body = String(rule).replace(/^RRULE:/i, '').trim();
  if (!body) return null;
  const out: Rule = { freq: '', interval: 1, byday: [], until: null, count: null };
  for (const part of body.split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case 'FREQ': out.freq = v.toUpperCase(); break;
      case 'INTERVAL': out.interval = Math.max(1, parseInt(v, 10) || 1); break;
      case 'BYDAY': out.byday = v.split(',').map((d) => DAY_CODES[d.replace(/^[-+]?\d+/, '').toUpperCase()]).filter((n) => n !== undefined); break;
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

function seriesHits(r: Rule, start: Date, day: Date): boolean {
  if (day < start) return false;
  if (r.until && day > r.until) return false;
  const days = dayDiff(start, day);
  switch (r.freq) {
    case 'DAILY': return days % r.interval === 0 && (!r.count || days / r.interval < r.count);
    case 'WEEKLY': {
      const set = r.byday.length ? r.byday : [start.getDay()];
      if (!set.includes(day.getDay())) return false;
      return Math.floor((days + start.getDay()) / 7) % r.interval === 0;
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

import React, { useMemo } from 'react';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { BarChart3 } from 'lucide-react';

// "This week" on the Care Log (Anna, Nov 10 2026): the day-by-day picture
// dedicated apps give, as a small table, newest day first. A baby gets feeds,
// sleep and diapers (what a checkup asks about); a cared-for adult gets meals,
// walks and exercise, good and hard days, and falls; a pet gets fed and
// walks. Nothing shows until there's been a log on two different days.

const dayOf = (iso) => { const d = iso ? parseISO(iso) : null; return d && isValid(d) ? format(d, 'yyyy-MM-dd') : ''; };
const hours = (min) => (min ? `${Math.round(min / 6) / 10}h` : '–');

const COLUMNS = {
  baby: [
    ['Feeds', (ls) => ls.filter((l) => l.entry_type === 'feeding' && l.status !== 'pending').length],
    ['Sleep', (ls) => hours(ls.filter((l) => l.entry_type === 'sleep' && l.status !== 'pending').reduce((a, l) => a + (Number(l.minutes) || 0), 0))],
    ['Wet', (ls) => ls.filter((l) => l.entry_type === 'diaper' && ['wet', 'mixed'].includes(l.sub_type)).length],
    ['Dirty', (ls) => ls.filter((l) => l.entry_type === 'diaper' && ['dirty', 'mixed'].includes(l.sub_type)).length],
  ],
  toddler: [
    ['Meals', (ls) => ls.filter((l) => l.entry_type === 'food').length],
    ['Naps', (ls) => ls.filter((l) => l.entry_type === 'sleep').length],
    ['Potty', (ls) => ls.filter((l) => l.entry_type === 'potty' && l.sub_type === 'success').length],
    ['Day', (ls) => moodOf(ls)],
  ],
  adult: [
    ['Meals', (ls) => ls.filter((l) => l.entry_type === 'care_log' && l.sub_type === 'meal').length],
    ['Active', (ls) => ls.filter((l) => l.entry_type === 'activity').length],
    ['Day', (ls) => moodOf(ls)],
    ['Falls', (ls) => ls.filter((l) => l.entry_type === 'care_log' && l.sub_type === 'fall').length || '–'],
  ],
  pet: [
    ['Fed', (ls) => ls.filter((l) => l.entry_type === 'pet_feeding').length],
    ['Walks', (ls) => ls.filter((l) => l.entry_type === 'pet_walk').length],
  ],
};
COLUMNS.senior = COLUMNS.adult;
COLUMNS.general = COLUMNS.adult;

function moodOf(ls) {
  const m = ls.filter((l) => l.mood);
  if (!m.length) return '–';
  const good = m.filter((l) => ['happy', 'calm'].includes(l.mood)).length;
  return good >= m.length - good ? '😊' : '😔';
}

export default function WeekSummary({ band, logs }) {
  const cols = COLUMNS[band];
  const days = useMemo(() => {
    const today = new Date();
    return [...Array(7)].map((_, i) => format(subDays(today, i), 'yyyy-MM-dd'));
  }, []);
  if (!cols) return null;
  const byDay = new Map(days.map((d) => [d, []]));
  for (const l of logs) { const d = dayOf(l.timestamp); if (byDay.has(d)) byDay.get(d).push(l); }
  if ([...byDay.values()].filter((ls) => ls.length).length < 2) return null;

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4">
      <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> This week</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal py-1">Day</th>
            {cols.map(([label]) => <th key={label} className="text-right font-normal py-1">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const ls = byDay.get(d);
            return (
              <tr key={d} className="border-t border-border/40">
                <td className="py-1.5">{i === 0 ? 'Today' : format(parseISO(d), 'EEE d')}</td>
                {cols.map(([label, fn]) => <td key={label} className="py-1.5 text-right tabular-nums">{ls.length ? fn(ls) : '–'}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

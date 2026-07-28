import React from 'react';
import { ClipboardCheck, Smartphone, Brain, PiggyBank } from 'lucide-react';

const moodLabels = { happy: 'Happy', calm: 'Calm', anxious: 'Anxious', irritable: 'Irritable', upset: 'Upset' };

export default function TodaySummary({ todayLogs }) {
  const choresToday = todayLogs.filter(l => l.entry_type === 'chore');
  const choresDone = choresToday.filter(l => l.completed).length;
  const screenMin = todayLogs.filter(l => l.entry_type === 'screen_time').reduce((s, l) => s + (l.screen_time_min || 0), 0);
  const moodEntries = todayLogs.filter(l => l.entry_type === 'mental');
  const latestMood = moodEntries[0]?.mood;
  const earnedToday = todayLogs
    .filter(l => l.entry_type === 'allowance' && l.allowance_type === 'earn')
    .reduce((s, l) => s + (l.amount || 0), 0);

  const cards = [
    { label: 'Chores', value: `${choresDone}/${choresToday.length}`, icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Screen Time', value: `${screenMin}m`, icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { label: 'Mood', value: latestMood ? moodLabels[latestMood] : '—', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
    { label: 'Earned Today', value: `$${earnedToday}`, icon: PiggyBank, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
            <c.icon className={`w-5 h-5 ${c.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none truncate">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
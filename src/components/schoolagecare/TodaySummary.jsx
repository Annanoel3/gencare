import React from 'react';
import { BookOpen, ClipboardCheck, Smile, Smartphone } from 'lucide-react';

const moodLabels = { happy: 'Happy', calm: 'Calm', anxious: 'Anxious', irritable: 'Irritable', upset: 'Upset' };

export default function TodaySummary({ todayLogs }) {
  const readingMin = todayLogs.filter(l => l.entry_type === 'reading').reduce((s, l) => s + (l.minutes || 0), 0);
  const choresToday = todayLogs.filter(l => l.entry_type === 'chore');
  const choresDone = choresToday.filter(l => l.completed).length;
  const moodEntries = todayLogs.filter(l => l.entry_type === 'mood');
  const latestMood = moodEntries[0]?.mood;
  const screenMin = todayLogs.filter(l => l.entry_type === 'screen_time').reduce((s, l) => s + (l.minutes || 0), 0);

  const cards = [
    { label: 'Reading', value: `${readingMin}m`, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Chores', value: `${choresDone}/${choresToday.length}`, icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Mood', value: latestMood ? moodLabels[latestMood] : '—', icon: Smile, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Screen Time', value: `${screenMin}m`, icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
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
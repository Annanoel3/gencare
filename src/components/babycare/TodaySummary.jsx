import React from 'react';
import { Milk, Droplets, Moon, Droplet } from 'lucide-react';

export default function TodaySummary({ todayLogs }) {
  const feedings = todayLogs.filter(l => l.entry_type === 'feeding').length;
  const diapers = todayLogs.filter(l => l.entry_type === 'diaper').length;
  const sleepMin = todayLogs.filter(l => l.entry_type === 'sleep').reduce((s, l) => s + (l.duration_min || 0), 0);
  const pumps = todayLogs.filter(l => l.entry_type === 'pumping').length;
  const sleepLabel = sleepMin >= 60 ? `${Math.floor(sleepMin / 60)}h ${sleepMin % 60}m` : `${sleepMin}m`;

  const cards = [
    { label: 'Feedings', value: feedings, icon: Milk, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-950/30' },
    { label: 'Diapers', value: diapers, icon: Droplets, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Sleep', value: sleepLabel, icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
    { label: 'Pumping', value: pumps, icon: Droplet, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
            <c.icon className={`w-5 h-5 ${c.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
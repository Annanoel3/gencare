import React from 'react';
import { format, parseISO } from 'date-fns';
import { Milk, Droplets, Moon, Droplet } from 'lucide-react';

const config = {
  feeding: { icon: Milk, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-950/30' },
  diaper: { icon: Droplets, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  sleep: { icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
  pumping: { icon: Droplet, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' },
};

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.feeding;
  const Icon = c.icon;
  const details = [];

  if (entry.entry_type === 'feeding') {
    if (entry.feeding_method === 'nursing') details.push(`Nursing · ${entry.breast_side || ''} side${entry.duration_min ? ` · ${entry.duration_min} min` : ''}`);
    else if (entry.feeding_method === 'bottle') details.push(`Bottle${entry.amount_ml ? ` · ${entry.amount_ml} ml` : ''}`);
    else details.push('Solid food');
  } else if (entry.entry_type === 'diaper') {
    details.push(`${entry.diaper_type || ''} diaper`);
  } else if (entry.entry_type === 'sleep') {
    details.push(`${entry.sleep_type === 'night' ? 'Night sleep' : 'Nap'}${entry.duration_min ? ` · ${entry.duration_min} min` : ''}`);
  } else if (entry.entry_type === 'pumping') {
    details.push(`Pumped${entry.amount_ml ? ` · ${entry.amount_ml} ml` : ''}`);
  }
  if (entry.notes) details.push(entry.notes);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg}`}>
        <Icon className={`w-4 h-4 ${c.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium capitalize">{entry.entry_type}</p>
        <p className="text-xs text-muted-foreground truncate">{details.filter(Boolean).join(' · ')}</p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {entry.timestamp ? format(parseISO(entry.timestamp), 'h:mm a') : ''}
      </span>
    </div>
  );
}
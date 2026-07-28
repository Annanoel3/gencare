import React from 'react';
import { format, parseISO } from 'date-fns';
import { Frown, Smile, Smartphone, Bath, Star } from 'lucide-react';

const config = {
  tantrum: { icon: Frown, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' },
  mood: { icon: Smile, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  screen_time: { icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  potty: { icon: Bath, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  milestone: { icon: Star, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
};

const moodLabels = {
  happy: 'Happy', calm: 'Calm', anxious: 'Anxious', irritable: 'Irritable', upset: 'Upset',
};

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.mood;
  const Icon = c.icon;
  const details = [];

  if (entry.entry_type === 'tantrum') {
    if (entry.tantrum_trigger) details.push(`Trigger: ${entry.tantrum_trigger}`);
    if (entry.tantrum_duration_min) details.push(`${entry.tantrum_duration_min} min`);
    if (entry.tantrum_response) details.push(`Handled: ${entry.tantrum_response}`);
  } else if (entry.entry_type === 'mood') {
    details.push(moodLabels[entry.mood] || entry.mood || 'Mood');
  } else if (entry.entry_type === 'screen_time') {
    details.push(`${entry.screen_time_min || 0} min`);
  } else if (entry.entry_type === 'potty') {
    details.push(entry.potty_type ? entry.potty_type.charAt(0).toUpperCase() + entry.potty_type.slice(1) : 'Potty');
  } else if (entry.entry_type === 'milestone') {
    details.push(`${entry.milestone_category || 'milestone'}: ${entry.milestone_description || ''}`);
  }
  if (entry.notes) details.push(entry.notes);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg}`}>
        <Icon className={`w-4 h-4 ${c.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium capitalize">{entry.entry_type.replace('_', ' ')}</p>
        <p className="text-xs text-muted-foreground truncate">{details.filter(Boolean).join(' · ')}</p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {entry.timestamp ? format(parseISO(entry.timestamp), 'h:mm a') : ''}
      </span>
    </div>
  );
}
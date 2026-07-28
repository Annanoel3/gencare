import React from 'react';
import { format, parseISO } from 'date-fns';
import { BookOpen, Pencil, ClipboardCheck, ShowerHead, Smile, Smartphone, Medal } from 'lucide-react';

const config = {
  reading: { icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  homework: { icon: Pencil, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
  chore: { icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  hygiene: { icon: ShowerHead, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
  mood: { icon: Smile, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  screen_time: { icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  activity: { icon: Medal, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
};

const moodLabels = { happy: 'Happy', calm: 'Calm', anxious: 'Anxious', irritable: 'Irritable', upset: 'Upset' };
const habitLabels = { shower: 'Showered', teeth: 'Brushed teeth', bedtime: 'Went to bed on time' };

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.reading;
  const Icon = c.icon;
  const details = [];

  if (entry.entry_type === 'reading') {
    if (entry.title) details.push(entry.title);
    if (entry.minutes) details.push(`${entry.minutes} min`);
  } else if (entry.entry_type === 'homework') {
    if (entry.title) details.push(entry.title);
    if (entry.due_date) details.push(`Due ${format(parseISO(entry.due_date), 'MMM d')}`);
    details.push(entry.completed ? '✓ Done' : 'Pending');
  } else if (entry.entry_type === 'chore') {
    if (entry.title) details.push(entry.title);
    if (entry.stars) details.push(`${entry.stars}★`);
    details.push(entry.completed ? '✓ Done' : 'Pending');
  } else if (entry.entry_type === 'hygiene') {
    details.push(habitLabels[entry.hygiene_habit] || entry.hygiene_habit || 'Hygiene');
  } else if (entry.entry_type === 'mood') {
    details.push(moodLabels[entry.mood] || entry.mood || 'Mood');
  } else if (entry.entry_type === 'screen_time') {
    details.push(`${entry.minutes || 0} min`);
  } else if (entry.entry_type === 'activity') {
    if (entry.title) details.push(entry.title);
    if (entry.minutes) details.push(`${entry.minutes} min`);
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
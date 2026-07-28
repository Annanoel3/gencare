import React from 'react';
import { format, parseISO } from 'date-fns';
import { BookOpen, ClipboardCheck, HeartPulse, ShowerHead, Brain, Smartphone, PiggyBank, Users } from 'lucide-react';

const config = {
  schoolwork: { icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  chore: { icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  puberty: { icon: HeartPulse, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  hygiene: { icon: ShowerHead, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
  mental: { icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  screen_time: { icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  allowance: { icon: PiggyBank, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  social: { icon: Users, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30' },
};

const moodLabels = { happy: 'Happy', calm: 'Calm', anxious: 'Anxious', irritable: 'Irritable', upset: 'Upset' };
const habitLabels = { shower: 'Showered', teeth: 'Brushed teeth', deodorant: 'Wore deodorant' };

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.schoolwork;
  const Icon = c.icon;
  const details = [];

  if (entry.entry_type === 'schoolwork') {
    details.push(entry.title || 'Schoolwork');
    if (entry.due_date) details.push(`Due ${format(parseISO(entry.due_date), 'MMM d')}`);
    if (entry.grade) details.push(`Grade: ${entry.grade}`);
  } else if (entry.entry_type === 'chore') {
    details.push(entry.title || 'Chore');
    if (entry.points) details.push(`${entry.points} pts`);
    details.push(entry.completed ? '✓ Done' : 'Pending');
  } else if (entry.entry_type === 'puberty') {
    details.push(entry.puberty_type ? entry.puberty_type.charAt(0).toUpperCase() + entry.puberty_type.slice(1) : '');
    if (entry.puberty_type === 'menstrual' && entry.cycle_start) details.push(`Started ${format(parseISO(entry.cycle_start), 'MMM d')}`);
  } else if (entry.entry_type === 'hygiene') {
    details.push(habitLabels[entry.hygiene_habit] || entry.hygiene_habit || 'Hygiene');
  } else if (entry.entry_type === 'mental') {
    details.push(moodLabels[entry.mood] || entry.mood || 'Mood');
    if (entry.anxiety_level) details.push(`Anxiety ${entry.anxiety_level}/5`);
    if (entry.stress_trigger) details.push(`Trigger: ${entry.stress_trigger}`);
  } else if (entry.entry_type === 'screen_time') {
    details.push(`${entry.screen_time_min || 0} min`);
  } else if (entry.entry_type === 'allowance') {
    details.push(`${entry.allowance_type ? entry.allowance_type.charAt(0).toUpperCase() + entry.allowance_type.slice(1) : ''} $${entry.amount || 0}`);
  } else if (entry.entry_type === 'social') {
    details.push(entry.social_activity ? entry.social_activity.charAt(0).toUpperCase() + entry.social_activity.slice(1) : 'Social');
    if (entry.title) details.push(entry.title);
    if (entry.social_contact) details.push(`Contact: ${entry.social_contact}`);
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
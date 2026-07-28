import React from 'react';
import { format, parseISO } from 'date-fns';
import { Car, Wallet, FileText, GraduationCap } from 'lucide-react';

const config = {
  transport: { icon: Car, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  financial: { icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  document: { icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  academic: { icon: GraduationCap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
};

const subLabels = {
  carpool: 'Carpool', rideshare: 'Rideshare', pickup: 'Pickup', dropoff: 'Drop-off',
  allowance: 'Allowance', school_fee: 'School fee', bank_transfer: 'Bank transfer',
  physical: 'Sports physical', immunization: 'Immunization', insurance: 'Insurance card', sports_clearance: 'Sports clearance',
  college_app: 'College application', fafsa: 'FAFSA', test: 'Standardized test',
};

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.transport;
  const Icon = c.icon;
  const details = [];

  if (entry.sub_type) details.push(subLabels[entry.sub_type] || entry.sub_type);
  if (entry.title) details.push(entry.title);
  if (entry.entry_type === 'transport') {
    if (entry.date) details.push(format(parseISO(entry.date), 'MMM d'));
    if (entry.time) details.push(entry.time);
    if (entry.location) details.push(entry.location);
    if (entry.contact) details.push(entry.contact);
  } else if (entry.entry_type === 'financial') {
    if (entry.amount) details.push(`$${entry.amount}`);
    if (entry.date) details.push(format(parseISO(entry.date), 'MMM d'));
  } else if (entry.entry_type === 'document') {
    if (entry.date) details.push(format(parseISO(entry.date), 'MMM d'));
  } else if (entry.entry_type === 'academic') {
    if (entry.date) details.push(`due ${format(parseISO(entry.date), 'MMM d')}`);
    if (entry.status) details.push(entry.status);
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
        {entry.timestamp ? format(parseISO(entry.timestamp), 'MMM d') : ''}
      </span>
    </div>
  );
}
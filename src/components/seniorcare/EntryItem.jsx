import React from 'react';
import { format, parseISO } from 'date-fns';
import { ClipboardList, ShieldCheck, Pill, Brain } from 'lucide-react';

const config = {
  care_log: { icon: ClipboardList, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  legal: { icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  medication: { icon: Pill, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  cognitive: { icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
};

const subLabels = {
  meal: 'Meal', vitals: 'Vitals', medication_given: 'Medication given',
  poa: 'Power of Attorney', living_will: 'Living will', dnr: 'DNR', medicaid: 'Medicaid', insurance: 'Insurance',
  prescription: 'Prescription', refill: 'Refill', contraindication: 'Contraindication',
  memory: 'Memory', language: 'Language', mobility: 'Mobility',
};

export default function EntryItem({ entry }) {
  const c = config[entry.entry_type] || config.care_log;
  const Icon = c.icon;
  const details = [];

  if (entry.sub_type) details.push(subLabels[entry.sub_type] || entry.sub_type);
  if (entry.title) details.push(entry.title);
  if (entry.entry_type === 'care_log') {
    if (entry.vitals) details.push(entry.vitals);
    if (entry.given_by) details.push(`by ${entry.given_by}`);
  } else if (entry.entry_type === 'medication') {
    if (entry.pharmacy) details.push(entry.pharmacy);
    if (entry.date) details.push(`refill ${format(parseISO(entry.date), 'MMM d')}`);
  } else if (entry.entry_type === 'legal') {
    if (entry.doc_url) details.push('doc on file');
  } else if (entry.entry_type === 'cognitive') {
    // title carries the observation
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
import React from 'react';
import { ClipboardList, ShieldCheck, Pill, Brain } from 'lucide-react';

export default function CategorySummary({ logs }) {
  const cards = [
    { label: 'Care Log', value: logs.filter(l => l.entry_type === 'care_log').length, icon: ClipboardList, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Legal Docs', value: logs.filter(l => l.entry_type === 'legal').length, icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Medications', value: logs.filter(l => l.entry_type === 'medication').length, icon: Pill, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Cognitive', value: logs.filter(l => l.entry_type === 'cognitive').length, icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
            <c.icon className={`w-5 h-5 ${c.color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
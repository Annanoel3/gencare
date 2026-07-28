import React from 'react';
import { Car, Wallet, FileText, GraduationCap } from 'lucide-react';

export default function CategorySummary({ logs }) {
  const counts = {
    transport: logs.filter(l => l.entry_type === 'transport').length,
    financial: logs.filter(l => l.entry_type === 'financial').length,
    document: logs.filter(l => l.entry_type === 'document').length,
    academic: logs.filter(l => l.entry_type === 'academic').length,
  };
  const cards = [
    { label: 'Transport', value: counts.transport, icon: Car, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Financial', value: counts.financial, icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Documents', value: counts.document, icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Academic', value: counts.academic, icon: GraduationCap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
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
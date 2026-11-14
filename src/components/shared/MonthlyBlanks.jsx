import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MONTHLY_FIRST, MONTHLY_SECOND } from '@/lib/occurrences';

// "The [14th] [day] of every month" / "The [second] [Tuesday] of every month"
// (Anna, Nov 14 2026): shows when something repeats every month, in the
// event form and the to-do form. The first blank is First to Fourth, Last,
// or a day number; the second is "day" or a day of the week. The form works
// out the rule and moves the date (lib/occurrences.js monthlyFromBlanks).
//
//   shortMonths  'skip' (events: a month without that day is skipped) or
//                'last' (to-dos: due on that month's last day instead)
//   note         a line under it, like where the date moved to

export default function MonthlyBlanks({ first, second, onChange, shortMonths = 'skip', note = '' }) {
  const n = /^d\d+$/.test(first) ? parseInt(first.slice(1), 10) : 0;
  const late = second === 'day' && n >= 29;
  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm">
        <span>The</span>
        <Select value={first} onValueChange={(v) => onChange(v, second)}>
          <SelectTrigger className="h-9 flex-1 min-w-0 bg-card" aria-label="Which one"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">{MONTHLY_FIRST.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={second} onValueChange={(v) => onChange(first, v)}>
          <SelectTrigger className="h-9 flex-1 min-w-0 bg-card" aria-label="Day or day of the week"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">{MONTHLY_SECOND.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-sm mt-1.5">of every month</p>
      {late && (
        <p className="text-xs text-muted-foreground mt-1.5">
          {shortMonths === 'last'
            ? `In a month without a ${MONTHLY_FIRST.find((o) => o.value === first)?.label}, it's due on that month's last day.`
            : `A month without a ${MONTHLY_FIRST.find((o) => o.value === first)?.label} is skipped. To land on the end of every month, pick Last.`}
        </p>
      )}
      {note && <p className="text-xs text-primary mt-1.5">{note}</p>}
    </div>
  );
}

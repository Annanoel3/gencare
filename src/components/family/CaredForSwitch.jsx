import React from 'react';
import { Switch } from '@/components/ui/switch';

// "Does the family help take care of them?" (Anna, Nov 10 2026: "offer an
// opportunity to indicate whether someone is being cared for"). When it's on,
// GenCare shares their appointments and plans with the whole family by default
// (the sorter in shared/eventSort.ts), so everyone can help. Left unanswered,
// GenCare works it out from who adds their events. Pets always count.

/** Under 18 by birthday: a sensible starting answer. */
export function youngerThan18(birthdate) {
  const t = birthdate ? Date.parse(birthdate) : NaN;
  return Number.isFinite(t) && (Date.now() - t) / (365.25 * 86400e3) < 18;
}

/** The answer to show: theirs if given, else the starting one from age. */
export const caredForShown = (value, birthdate) => (typeof value === 'boolean' ? value : youngerThan18(birthdate));

export default function CaredForSwitch({ checked, onChange, name }) {
  const first = String(name || '').trim().split(' ')[0];
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium">The family helps take care of {first || 'them'}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">Their appointments and plans are shared with everyone, so anyone can help.</span>
      </span>
      <Switch checked={!!checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5 flex-shrink-0" />
    </label>
  );
}

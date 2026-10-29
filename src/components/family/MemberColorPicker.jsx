import React from 'react';
import { Check } from 'lucide-react';
import { MEMBER_COLOR_PALETTE } from '@/utils/memberColors';

// Colors someone else already has (and the pets' brown) can't be picked, so
// no two people ever share a color.
export default function MemberColorPicker({ value, onChange, taken = new Set() }) {
  const choices = MEMBER_COLOR_PALETTE.filter((c) => c === value || !taken.has(c));
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">Color:</span>
      {choices.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full ${c} flex items-center justify-center ring-offset-2 ring-offset-background ${value === c ? 'ring-2 ring-foreground' : ''}`}
          aria-label={`Choose color ${c}`}
        >
          {value === c && <Check className="w-3 h-3 text-white" />}
        </button>
      ))}
    </div>
  );
}

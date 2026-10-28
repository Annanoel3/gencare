import React from 'react';
import { Check } from 'lucide-react';
import { MEMBER_COLOR_PALETTE } from '@/utils/memberColors';

export default function MemberColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">Color:</span>
      {MEMBER_COLOR_PALETTE.map(c => (
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
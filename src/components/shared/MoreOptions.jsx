import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The extra fields of an add form, folded away so adding something is just
 * its name and when (Anna, Oct 29 2026: "way too many fields... no one is
 * going to take the time"). `hint` says what's inside; editing opens it.
 */
export default function MoreOptions({ children, hint = '', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left" aria-expanded={open}>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">More options</span>
          {!open && hint && <span className="block text-xs text-muted-foreground truncate">{hint}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-4">{children}</div>}
    </div>
  );
}

/** A row of tap-to-pick choices, used for "when" and "how often". */
export function Choices({ value, options, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${value === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

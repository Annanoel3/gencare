import React from 'react';

// A person's name as a round button with their color dot: the Calendar's
// "one person's events" and the phone calendar's "Whose events".
export default function PersonChip({ on, dot, onClick, children, ...rest }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} {...rest}
      className={`h-8 px-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}>
      {dot && <span className={`w-2.5 h-2.5 rounded-full ${dot} ${on ? 'ring-2 ring-primary-foreground/80' : ''}`} />}
      {children}
    </button>
  );
}

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Home's sections other than Today Across the Family start closed (Anna,
// Nov 17 2026), so Home is short: the name, how many, and a tap opens it.
// This phone remembers which ones were left open. `openNow` opens one by
// itself while it matters (a visit to record happening now); closed by hand,
// it stays closed the rest of that day.
const KEY = 'gencare_home_open';
const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };

export default function HomeSection({ id, title, icon, count, note, openNow = false, children }) {
  const [choice, setChoice] = useState(null);
  const today = new Date().toDateString();
  const was = saved();
  const open = choice ?? (!!was[id] || (openNow && was[`${id}_closed`] !== today));
  const toggle = () => {
    const next = !open;
    setChoice(next);
    try {
      const all = saved();
      all[id] = next;
      if (next) delete all[`${id}_closed`]; else all[`${id}_closed`] = today;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* still opens this time */ }
  };
  return (
    <div className="bg-card rounded-2xl border border-border/50 mb-6">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2 p-4 md:px-6 text-left">
        {icon}
        <h2 className="font-heading text-lg font-semibold min-w-0">{title}</h2>
        {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
        <ChevronDown className={`ml-auto w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {!open && note && <p className="px-4 md:px-6 -mt-2 pb-4 text-sm text-muted-foreground">{note}</p>}
      {open && <div className="px-4 pb-4 md:px-6 md:pb-6 -mt-1">{children}</div>}
    </div>
  );
}

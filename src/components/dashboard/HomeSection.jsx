import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Home's sections other than Today Across the Family start closed (Anna,
// Nov 17 2026): the name, how many, and a tap opens it. Some show their
// first item (`preview`) and the top of the second fading out (`previewNext`)
// so it's plain there's more. Always closed when Home opens again, and when
// the app comes back from the background ("If the user expands it and then
// leaves, it should be collapsed next open").
try { localStorage.removeItem('gencare_home_open'); } catch { /* nothing kept */ }

export default function HomeSection({ title, icon, count, preview, previewNext, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const away = () => { if (document.visibilityState === 'hidden') setOpen(false); };
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, []);
  return (
    <div className="bg-card rounded-2xl border border-border/50 mb-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 p-4 md:px-6 text-left">
        {icon}
        <h2 className="font-heading text-lg font-semibold min-w-0">{title}</h2>
        {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
        <ChevronDown className={`ml-auto w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="px-4 pb-4 md:px-6 md:pb-6 -mt-1">{children}</div>
      ) : preview ? (
        <div className="px-4 md:px-6 -mt-1 pb-2">
          {preview}
          {previewNext && (
            // The top of the next one, fading out: a tap opens the section.
            <div
              role="button"
              tabIndex={0}
              aria-label={`Show all of ${title}`}
              onClick={() => setOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
              className="relative h-10 overflow-hidden cursor-pointer"
            >
              <div inert="" aria-hidden="true" className="pointer-events-none">{previewNext}</div>
              <span className="absolute inset-0 bg-gradient-to-b from-transparent to-card to-90%" aria-hidden="true" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

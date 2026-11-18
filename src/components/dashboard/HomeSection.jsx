import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Home's sections other than Today Across the Family start closed (Anna,
// Nov 17 2026): the name, how many, and a tap opens it. Some show their
// first item (`preview`) and the top of the second fading out (`previewNext`)
// so it's plain there's more, with "See more" under it (and "Show less" at
// the bottom once open: Anna, Nov 17 2026). Always closed when Home opens again, and when
// the app comes back from the background ("If the user expands it and then
// leaves, it should be collapsed next open").
try { localStorage.removeItem('gencare_home_open'); } catch { /* nothing kept */ }

// nextHeight: how much of the next item shows, fading (To-do's is taller to make up for its gap).
export default function HomeSection({ title, icon, count, preview, previewNext, nextHeight = 'h-10', children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  // Closing from the bottom of a long list: bring the section's name back on screen.
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      const el = box.current;
      if (el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  useEffect(() => {
    const away = () => { if (document.visibilityState === 'hidden') setOpen(false); };
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, []);
  return (
    <div ref={box} className="bg-card rounded-2xl border border-border/50 mb-6 scroll-mt-20">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 p-4 md:px-6 text-left">
        {icon}
        <h2 className="font-heading text-lg font-semibold min-w-0">{title}</h2>
        {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
        <ChevronDown className={`ml-auto w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="px-4 pb-4 md:px-6 md:pb-6 -mt-1">
          {children}
          {preview && <button type="button" onClick={close} className="w-full pt-3 pb-1 text-sm font-semibold text-primary">Show less</button>}
        </div>
      ) : preview ? (
        <div className="px-4 md:px-6 -mt-1 pb-2">
          {preview}
          {previewNext && (
            <>
              {/* The top of the next one, fading out; a tap on it opens the section too. */}
              <div onClick={() => setOpen(true)} aria-hidden="true" className={`relative ${nextHeight} overflow-hidden cursor-pointer`}>
                <div inert="" className="pointer-events-none">{previewNext}</div>
                <span className="absolute inset-0 bg-gradient-to-b from-transparent to-card to-90%" />
              </div>
              <button type="button" onClick={() => setOpen(true)} className="w-full py-2 text-sm font-semibold text-primary">See more</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

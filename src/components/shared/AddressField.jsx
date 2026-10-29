import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, X, Search, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AddressLink from '@/components/shared/AddressLink';
import { track } from '@/lib/activity';

// Answers already fetched this session, so going back over a word is instant.
// A suggestion is taken on touch-down (and the box keeps the keyboard), so
// the keyboard closing can't shift the list out from under the tap.
const cache = new Map();
let warm = null; // { zip, own } once the first box was tapped

const ask = (body) => base44.functions.invoke('placesAutocomplete', body).then((r) => r?.data || r);

/**
 * "Where" with place search (functions/placesAutocomplete, like ADHDone):
 * type "HEB Slaughter" and pick the full address, or keep what you typed.
 * Results lean toward the person's home ZIP (the same one Resources uses);
 * with no ZIP in the family yet, it asks once, right here. Once there's an
 * address, the button beside it opens it in maps.
 */
export default function AddressField({ value, onChange, className = '' }) {
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [home, setHome] = useState(warm);
  const [zip, setZip] = useState('');
  const [savingZip, setSavingZip] = useState(false);
  const box = useRef(null);
  const q = String(value || '').trim();

  // Tapping the box starts the search function and checks for a home ZIP,
  // so the first suggestions come back without the start-up wait.
  const onFocus = () => {
    setFocused(true); setTyping(true);
    if (!warm) ask({ warm: true }).then((d) => { warm = { zip: d?.zip || '', own: !!d?.own }; setHome(warm); }).catch(() => {});
  };

  useEffect(() => {
    if (!typing || q.length < 2) { setItems([]); setBusy(false); return undefined; }
    const key = q.toLowerCase();
    if (cache.has(key)) { setItems(cache.get(key)); setBusy(false); return undefined; }
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const d = await ask({ input: q });
        const list = d?.suggestions || [];
        cache.set(key, list);
        if (live) setItems(list);
      } catch (_e) { if (live) setItems([]); }
      finally { if (live) setBusy(false); }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, typing]);

  // A tap anywhere else closes the list.
  useEffect(() => {
    if (!focused) return undefined;
    const off = (e) => { if (box.current && !box.current.contains(e.target)) { setTyping(false); setFocused(false); } };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [focused]);

  const pick = (s) => { onChange(s); setTyping(false); setItems([]); if (s) track('action', 'place picked from search'); };

  const saveZip = async () => {
    const z = zip.replace(/\D/g, '').slice(0, 5);
    if (z.length !== 5) return;
    setSavingZip(true);
    try {
      await base44.auth.updateMe({ help_zip: z });
      warm = { zip: z, own: true }; setHome(warm); cache.clear();
      track('action', 'home ZIP added from event');
      if (q.length >= 2) { setTyping(false); setTimeout(() => setTyping(true), 0); }
    } catch (_e) { /* try again later */ }
    finally { setSavingZip(false); }
  };

  const showList = typing && q.length >= 2 && (busy || items.length > 0);
  const needZip = focused && home && !home.zip && !showList;

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input value={value || ''} onChange={(e) => { onChange(e.target.value); setTyping(true); }} onFocus={onFocus}
            placeholder="Search a place, like HEB Slaughter" autoComplete="off" className="pl-9 pr-8" />
          {q && <button type="button" onClick={() => pick('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" aria-label="Clear the place"><X className="w-3.5 h-3.5" /></button>}
        </div>
        {q && (
          <AddressLink address={q} label="Open in maps" className="h-10 px-3 rounded-xl border border-border bg-card text-primary flex items-center gap-1.5 text-sm font-medium flex-shrink-0">
            <Navigation className="w-4 h-4" /> Maps
          </AddressLink>
        )}
      </div>
      {focused && !q && !needZip && <p className="text-xs text-muted-foreground mt-1.5">Start typing a name or address and pick it from the list.</p>}

      {needZip && (
        <div className="mt-2 rounded-xl border border-border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Add your home ZIP so places near you come up first. It's only used to sort search results and local help. GenCare never tracks where you are.</p>
          <div className="flex gap-2 mt-2">
            <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoComplete="postal-code" placeholder="ZIP code" className="w-28 h-9 bg-card" aria-label="Home ZIP code" />
            <Button type="button" size="sm" onClick={saveZip} disabled={zip.length !== 5 || savingZip}>{savingZip ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      )}

      {showList && (
        <ul className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {busy && items.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</li>}
          {items.map((s) => (
            <li key={s}>
              <button type="button" onPointerDown={(e) => { e.preventDefault(); pick(s); }} onClick={() => pick(s)} className="w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 hover:bg-muted">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" /><span>{s}</span>
              </button>
            </li>
          ))}
          {home && !home.zip && items.length > 0 && (
            <li className="border-t border-border">
              <button type="button" onClick={() => setTyping(false)} className="w-full text-left px-3 py-2.5 text-xs text-primary flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> Not near you? Add your home ZIP
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

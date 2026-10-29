import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import AddressLink from '@/components/shared/AddressLink';

/**
 * "Where" with place search (functions/placesAutocomplete, like ADHDone):
 * type "HEB South Austin" and pick the full address, or keep what you typed.
 * Once there's an address, the button beside it opens it in maps.
 */
export default function AddressField({ value, onChange, placeholder = 'Type a place or an address', className = '' }) {
  const [typing, setTyping] = useState(false);
  const [items, setItems] = useState([]);
  const box = useRef(null);
  const q = String(value || '').trim();

  useEffect(() => {
    if (!typing || q.length < 3) { setItems([]); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('placesAutocomplete', { input: q });
        if (live) setItems((res?.data || res)?.suggestions || []);
      } catch (_e) { if (live) setItems([]); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, typing]);

  // A tap anywhere else closes the list.
  useEffect(() => {
    if (!typing) return undefined;
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setTyping(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [typing]);

  const pick = (s) => { onChange(s); setTyping(false); setItems([]); };

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Input value={value || ''} onChange={(e) => { onChange(e.target.value); setTyping(true); }} onFocus={() => setTyping(true)} placeholder={placeholder} autoComplete="off" className="pr-8" />
          {q && <button type="button" onClick={() => pick('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" aria-label="Clear the place"><X className="w-3.5 h-3.5" /></button>}
        </div>
        {q && (
          <AddressLink address={q} label="Open in maps" className="h-10 px-3 rounded-xl border border-border bg-card text-primary flex items-center gap-1.5 text-sm font-medium flex-shrink-0">
            <Navigation className="w-4 h-4" /> Maps
          </AddressLink>
        )}
      </div>
      {typing && q.length >= 3 && items.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {items.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => pick(s)} className="w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 hover:bg-muted">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" /><span>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import React from 'react';
import { Navigation } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { openMaps, needsMapChoice, MAP_APPS, lastMapsApp } from '@/lib/maps';
import { track } from '@/lib/activity';

/**
 * An address you can tap to open in maps (lib/maps.js). On an iPhone it asks
 * Apple Maps, Google Maps or Waze, last pick first. Inside a tappable card it
 * doesn't open the card.
 */
export default function AddressLink({ address, className = '', children, label }) {
  const go = (key) => { openMaps(address, key); track('action', 'open in maps'); };
  const stop = (e) => { e.stopPropagation(); };
  if (!String(address || '').trim()) return null;
  const content = children || <><Navigation className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{address}</span></>;
  if (!needsMapChoice()) {
    return (
      <button type="button" onClick={(e) => { stop(e); go(); }} className={className} aria-label={label || `Open ${address} in maps`}>
        {content}
      </button>
    );
  }
  const last = lastMapsApp();
  const apps = [...MAP_APPS].sort((a, b) => (b.key === last) - (a.key === last));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={stop} onPointerDown={stop} className={className} aria-label={label || `Open ${address} in maps`}>{content}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {apps.map((m) => <DropdownMenuItem key={m.key} onSelect={() => go(m.key)}>Open in {m.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import React from 'react';
import { Phone, MessageSquare } from 'lucide-react';

// Call / text buttons for a phone number. tel: and sms: links are handed to
// the phone's own apps by the Android app (MainActivity.launchExternalScheme)
// and work as plain links in a browser.
export function cleanPhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? digits : '';
}

export default function PhoneActions({ number, name, size = 'sm' }) {
  const n = cleanPhone(number);
  if (!n) return null;
  const cls = size === 'sm'
    ? 'inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted'
    : 'inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted';
  return (
    <span className="inline-flex gap-2">
      <a href={`tel:${n}`} className={cls} aria-label={`Call ${name || n}`}><Phone className="w-3.5 h-3.5" /> Call</a>
      <a href={`sms:${n}`} className={cls} aria-label={`Text ${name || n}`}><MessageSquare className="w-3.5 h-3.5" /> Text</a>
    </span>
  );
}

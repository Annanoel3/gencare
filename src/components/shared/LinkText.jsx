import React from 'react';
import { externalClick } from '@/lib/phone';

// Web addresses in plain text (https://…, http://…, www.…). A full stop,
// comma or closing bracket right after an address is left out of the link.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAIL_RE = /[.,;:!?'")\]]+$/;

const hrefOf = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/**
 * Text with its links tappable (they open in the phone's browser, like the
 * other outside links in GenCare). Line breaks are kept.
 */
export default function LinkText({ text, className = '' }) {
  const s = String(text || '');
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    let url = m[1];
    const trail = url.match(TRAIL_RE)?.[0] || '';
    if (trail) url = url.slice(0, -trail.length);
    if (m.index > last) parts.push(s.slice(last, m.index));
    const href = hrefOf(url);
    parts.push(
      <a key={m.index} href={href} target="_blank" rel="noreferrer" onClick={externalClick(href)}
        className="text-primary underline underline-offset-2 break-all">{url}</a>
    );
    last = m.index + url.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return <span className={`whitespace-pre-wrap break-words ${className}`}>{parts}</span>;
}

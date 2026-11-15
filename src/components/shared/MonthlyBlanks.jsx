import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MONTHLY_FIRST, MONTHLY_SECOND, normalizeBlanks } from '@/lib/occurrences';

// "The ___ ___ of every month" (Anna, Nov 14 2026), in the event form and
// the to-do form. Picking "Every month" pops this up right away (Anna: "if a
// user clicks every month, that should already be popping up"): two
// scrolling lists side by side, the first First to Fourth, Last, or a day
// number, the second "day" or a day of the week, with the sentence they make
// above them. After that the form shows the sentence with Change to open it
// again. The form works out the rule and moves the date
// (lib/occurrences.js monthlyFromBlanks).
//
//   autoOpen     true to pop it up (the form sets it when Every month is picked);
//                onOpened clears it
//   shortMonths  'skip' (events: a month without that day is skipped) or
//                'last' (to-dos: due on that month's last day instead)
//   note         a line under it, like where the date moved to

const labelOf = (list, v) => list.find((o) => o.value === v)?.label || '';
/** "the second Tuesday", "the 14th day", "the last day" */
export function blanksWords(first, second) {
  const b = normalizeBlanks(first, second);
  const one = labelOf(MONTHLY_FIRST, b.first);
  return `the ${/^\d/.test(one) ? one : one.toLowerCase()} ${labelOf(MONTHLY_SECOND, b.second)}`;
}

function Column({ items, value, onPick, label, lineBefore = '' }) {
  const box = useRef(null);
  useEffect(() => {
    // Open on the picked one.
    const el = box.current?.querySelector('[data-on="1"]');
    if (el && box.current) box.current.scrollTop = el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} role="listbox" aria-label={label} className="relative h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1">
      {items.map((o) => {
        const on = o.value === value;
        return (
          <React.Fragment key={o.value}>
          {/* A thin line between First...Last and 1st, 2nd, 3rd... */}
          {o.value === lineBefore && <div role="separator" className="my-1 mx-2 border-t border-border" />}
          <button type="button" role="option" aria-selected={on} data-on={on ? '1' : '0'} onClick={() => onPick(o.value)}
            className={`w-full rounded-lg px-3 py-2.5 text-left text-base ${on ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>
            {o.label}
          </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function MonthlyBlanks({ first, second, onChange, shortMonths = 'skip', note = '', autoOpen = false, onOpened }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState({ first, second });
  const show = () => { setPick({ first, second }); setOpen(true); };
  useEffect(() => { if (autoOpen) { show(); onOpened?.(); } }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = /^d\d+$/.test(first) ? parseInt(first.slice(1), 10) : 0;
  const late = second === 'day' && n >= 29;
  const words = blanksWords(first, second);
  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium min-w-0">{words[0].toUpperCase() + words.slice(1)} of every month</p>
        <Button type="button" variant="outline" size="sm" onClick={show} className="flex-shrink-0">Change</Button>
      </div>
      {late && (
        <p className="text-xs text-muted-foreground mt-1.5">
          {shortMonths === 'last'
            ? `In a month without a ${labelOf(MONTHLY_FIRST, first)}, it's due on that month's last day.`
            : `A month without a ${labelOf(MONTHLY_FIRST, first)} is skipped. To land on the end of every month, pick Last.`}
        </p>
      )}
      {note && <p className="text-xs text-primary mt-1.5">{note}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Every month on</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              {(() => { const w = blanksWords(pick.first, pick.second); return `${w[0].toUpperCase() + w.slice(1)} of every month`; })()}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {/* A day number goes with "day"; a day of the week turns a day number into its week (the 14th -> second). */}
            <Column label="Which one" items={MONTHLY_FIRST} lineBefore="d1" value={pick.first} onPick={(v) => setPick((p) => ({ first: v, second: v.startsWith('d') ? 'day' : p.second }))} />
            <Column label="Day or day of the week" items={MONTHLY_SECOND} value={pick.second} onPick={(v) => setPick((p) => (v !== 'day' && p.first.startsWith('d') ? normalizeBlanks(p.first, v) : { first: p.first, second: v }))} />
          </div>
          <Button type="button" className="w-full mt-1" onClick={() => { setOpen(false); if (pick.first !== first || pick.second !== second) onChange(pick.first, pick.second); }}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

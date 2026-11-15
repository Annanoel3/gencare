import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The one way to mark something done, everywhere (Anna, Nov 14 2026, from the
 * audit for older family members: events and to-dos had a small circle,
 * reminders a "Done" button). A green "Done" button, and "Undo" once it's done.
 * It stops the tap here, so a card that opens on a tap doesn't open too.
 */
export default function DoneButton({ done = false, busy = false, onDone, onUndo, label = '', className = '' }) {
  const stop = (fn) => (e) => { e?.stopPropagation?.(); e?.preventDefault?.(); if (!busy) fn?.(e); };
  const keys = (e) => e.stopPropagation();
  if (done) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={stop(onUndo)} onKeyDown={keys} disabled={busy}
        aria-label={label ? `Undo "${label}"` : 'Undo'} className={`rounded-xl bg-card ${className}`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Undo'}
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" onClick={stop(onDone)} onKeyDown={keys} disabled={busy}
      aria-label={label ? `Mark "${label}" done` : 'Done'} className={`rounded-xl gap-1 ${className}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Done
    </Button>
  );
}

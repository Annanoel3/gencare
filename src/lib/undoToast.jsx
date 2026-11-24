import React from 'react';
import { toast } from '@/components/ui/use-toast';

// Done takes a thing off the list (Anna, Nov 23 2026: "Only skipped things
// should be crossed off. Done things should be gone"), so tapping Done by
// mistake is one tap to put back. The message closes on its own like every
// other; after that, today's done reminders are on the Reminders page's Done tab.
export function doneWithUndo(what, undo) {
  let shown = null;
  shown = toast({
    title: 'Done',
    description: what,
    action: (
      <button type="button" onClick={() => { shown?.dismiss(); undo(); }}
        className="shrink-0 h-11 px-5 rounded-lg border border-border bg-card text-base font-semibold hover:bg-muted">Undo</button>
    ),
  });
}

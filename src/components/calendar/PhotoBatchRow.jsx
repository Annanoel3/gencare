import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { serverDate } from '@/lib/serverTime';
import { exportSoon } from '@/lib/calendarSync';
import { track } from '@/lib/activity';
import { photoBatch, takeOff, putBack } from '@/lib/photoBatch';

// In an event that came from a photo (Anna, Nov 12 2026: "Is there like an
// easy undo button"): how many came from that photo, and one button that
// takes off the ones still to come, with Undo. Ones already past stay.

export default function PhotoBatchRow({ appt, beforeRemove, onDone }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const importId = appt?.import_id || '';

  useEffect(() => {
    setRows(null); setAsking(false);
    if (!importId) return undefined;
    let gone = false;
    photoBatch(importId).then((r) => { if (!gone) setRows(r); }).catch(() => { if (!gone) setRows([]); });
    return () => { gone = true; };
  }, [importId]);

  if (!importId || !rows || rows.length < 2) return null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const ahead = rows.filter((r) => String(r.date || '') >= today);
  const added = serverDate(appt.created_date);
  const when = added ? format(added, 'MMM d') : '';

  const remove = async () => {
    setBusy(true);
    beforeRemove?.();
    const copies = ahead.map((r) => ({ ...r }));
    try {
      const n = await takeOff(ahead);
      track('action', 'photo import: taken off', `${n}`);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      exportSoon();
      const t = toast({
        title: n === 1 ? 'Took off 1 event' : `Took off ${n} events`,
        description: 'Add the new schedule with From a photo.',
        action: (
          <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium shrink-0" onClick={async () => {
            t.dismiss();
            await putBack(copies);
            qc.invalidateQueries({ queryKey: ['appointments'] });
            exportSoon();
            toast({ title: 'Put back', description: 'They\'re on the calendar again.' });
          }}>Undo</button>
        ),
      });
      onDone?.();
    } catch {
      toast({ title: "Couldn't take them off", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(false); setAsking(false); }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <p className="text-sm flex items-start gap-2">
        <Camera className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <span>Added from a photo{when ? ` on ${when}` : ''} with {rows.length - 1} other event{rows.length === 2 ? '' : 's'}. {ahead.length} {ahead.length === 1 ? 'is' : 'are'} still to come.</span>
      </p>
      {ahead.length > 0 && (asking ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" size="sm" className="rounded-lg" disabled={busy} onClick={remove}>
            {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Taking off…</> : `Yes, take off all ${ahead.length}`}
          </Button>
          <Button variant="ghost" size="sm" className="rounded-lg" disabled={busy} onClick={() => setAsking(false)}>Keep them</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={() => setAsking(true)}>
          Take off the {ahead.length} still to come from this photo
        </Button>
      ))}
    </div>
  );
}

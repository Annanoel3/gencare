import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BellRing, Check, X, Loader2 } from 'lucide-react';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import { markSlot, fmtClock } from '@/lib/reminders';

/**
 * One of today's reminders on the To-do page, between the day's events and
 * tasks: Done or Skip (anyone in the family), Undo after. Tap the words to
 * edit the reminder.
 */
export default function ReminderSlotCard({ slot, members = [], onOpen }) {
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const [busy, setBusy] = useState(false);
  const s = slot;
  const done = s.status === 'taken' || s.status === 'skipped';
  const late = !done && (s.status === 'missed' || s.time < format(new Date(), 'HH:mm'));
  const color = s.med.family_member_id ? getMemberColorByMemberId(s.med.family_member_id, members) : null;
  const tint = s.med.family_member_id ? getMemberLightColorByMemberId(s.med.family_member_id, members) : 'bg-card';

  const mark = async (status) => {
    setBusy(true);
    try { await markSlot(s, status, me); } catch (e) { toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
    queryClient.invalidateQueries({ queryKey: ['reminderLogs'] });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl ${tint} border border-border/50 ${done ? 'opacity-60' : ''}`}>
      {color && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
      <div className="flex items-center gap-3 p-3.5 pl-4">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-3.5 h-3.5 text-primary" />
        </div>
        <button type="button" onClick={() => onOpen?.(s.med)} className="flex-1 min-w-0 text-left">
          <p className={`font-medium text-sm leading-snug ${s.status === 'taken' ? 'line-through' : ''}`}>{s.med.medication_name}{s.med.dosage ? ` · ${s.med.dosage}` : ''}</p>
          <p className={`text-xs mt-1 ${late && !done ? 'text-destructive' : 'text-muted-foreground'}`}>
            {[s.med.family_member_name, fmtClock(s.time)].filter(Boolean).join(' · ')}
            {s.status === 'taken' && s.log?.taken_by_name ? ` · done by ${s.log.taken_by_name.split(' ')[0]}` : ''}
            {s.status === 'skipped' ? ' · skipped' : ''}
            {s.status === 'missed' ? ' · not done yet' : ''}
          </p>
        </button>
        {done ? (
          <Button variant="ghost" size="sm" onClick={() => mark('due')} disabled={busy} className="text-xs">Undo</Button>
        ) : (
          <>
            <Button variant="ghost" size="icon" onClick={() => mark('skipped')} disabled={busy} aria-label="Skip" className="rounded-full text-muted-foreground"><X className="w-4 h-4" /></Button>
            <Button size="sm" onClick={() => mark('taken')} disabled={busy} className="rounded-xl gap-1">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Done</Button>
          </>
        )}
      </div>
    </div>
  );
}

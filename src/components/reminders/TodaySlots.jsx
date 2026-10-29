import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId } from '@/utils/memberColors';
import { REMINDERS_KEY, listReminders, slotsForDay, markSlot, fmtClock, todayStr } from '@/lib/reminders';

/**
 * Today's reminders (the set-time ones from Reminders), each with Done / Skip
 * that anyone in the family can tap. Used on the To-do page and on Reminders.
 * Renders nothing when there are none today.
 */
export default function TodaySlots({ members: given, title = 'Today', className = '' }) {
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const [busyKey, setBusyKey] = useState(null);
  const today = todayStr();
  const { data: reminders = [] } = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders });
  const { data: fetchedMembers = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list(), enabled: !given });
  const members = given || fetchedMembers;
  const since = format(new Date(Date.now() - 14 * 86400000), 'yyyy-MM-dd');
  const { data: logs = [] } = useQuery({ queryKey: ['reminderLogs', since], queryFn: () => base44.entities.MedicationLog.filter({ day: { $gte: since } }, '-day', 500) });

  const slots = useMemo(() => slotsForDay(reminders, logs, today), [reminders, logs, today]);
  const nowClock = format(new Date(), 'HH:mm');

  const mark = async (slot, status) => {
    setBusyKey(slot.key);
    try { await markSlot(slot, status, me); } catch (e) { toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' }); }
    finally { setBusyKey(null); }
    queryClient.invalidateQueries({ queryKey: ['reminderLogs'] });
  };

  if (!slots.length) return null;
  return (
    <section className={className}>
      {title && <h2 className="font-heading text-base font-semibold mb-2">{title}</h2>}
      <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/50">
        {slots.map((s) => {
          const color = getMemberColorByMemberId(s.med.family_member_id, members);
          const done = s.status === 'taken' || s.status === 'skipped';
          const late = s.status === 'missed' || (s.status === 'due' && s.time < nowClock);
          const busy = busyKey === s.key;
          return (
            <div key={s.key} className={`flex items-center gap-3 p-3 ${done ? 'opacity-60' : ''}`}>
              <span className={`w-1.5 self-stretch rounded-full ${color}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${s.status === 'taken' ? 'line-through' : ''}`}>{s.med.medication_name}{s.med.dosage ? ` · ${s.med.dosage}` : ''}</p>
                <p className="text-xs text-muted-foreground">
                  {[s.med.family_member_name, fmtClock(s.time)].filter(Boolean).join(' · ')}
                  {s.status === 'taken' && s.log?.taken_by_name ? ` · done by ${s.log.taken_by_name.split(' ')[0]}` : ''}
                  {s.status === 'skipped' ? ' · skipped' : ''}
                  {s.status === 'missed' ? ' · not done yet' : ''}
                </p>
              </div>
              {done ? (
                <Button variant="ghost" size="sm" onClick={() => mark(s, 'due')} disabled={busy} className="text-xs">Undo</Button>
              ) : (
                <>
                  <Button variant="ghost" size="icon" onClick={() => mark(s, 'skipped')} disabled={busy} aria-label="Skip" className="rounded-full text-muted-foreground"><X className="w-4 h-4" /></Button>
                  <Button size="sm" onClick={() => mark(s, 'taken')} disabled={busy} className={`rounded-xl gap-1 ${late ? '' : 'bg-primary/90'}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Done</Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

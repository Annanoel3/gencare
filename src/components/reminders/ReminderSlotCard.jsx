import React, { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/activity';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { BellRing, Lock, Check } from 'lucide-react';
import DoneButton from '@/components/shared/DoneButton';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import { markSlot, fmtClock, REMINDERS_KEY, stepsOf, stepSlot, ticksFor, tickStep, untickLast } from '@/lib/reminders';
import { plainError } from '@/lib/errors';

/**
 * One of today's reminders on the Reminders page, between the day's events
 * and to-dos: Done or Skip (anyone in the family), Undo after. Tap the words to
 * edit the reminder. "I'll take it" says you'll do it today (or, for a one-off,
 * at all), and its pushes come to you.
 */
export default function ReminderSlotCard({ slot, members = [], onOpen, focus = false }) {
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const [busy, setBusy] = useState(false);
  const s = slot;
  const done = s.status === 'taken' || s.status === 'skipped';
  // An "until it's done" reminder that keeps reminding isn't late; it says
  // when the next push comes instead.
  const nags = Array.isArray(s.nags) ? s.nags : null;
  const next = nags && !done ? nags.find((t) => t > format(new Date(), 'HH:mm')) : null;
  const late = !done && !nags && (s.status === 'missed' || s.time < format(new Date(), 'HH:mm'));
  const color = s.med.family_member_id ? getMemberColorByMemberId(s.med.family_member_id, members) : null;
  const tint = s.med.family_member_id ? getMemberLightColorByMemberId(s.med.family_member_id, members) : 'bg-card';

  const mark = async (status) => {
    setBusy(true);
    try { await markSlot(s, status, me); track('action', status === 'taken' ? 'done:reminder' : status === 'skipped' ? 'skip:reminder' : 'undo:reminder', s.med.frequency === 'Once' ? 'until done' : ''); } catch (e) { toast({ title: "Couldn't save", description: plainError(e), variant: 'destructive' }); }
    finally { setBusy(false); }
    queryClient.invalidateQueries({ queryKey: ['reminderLogs'] });
    if (s.med.frequency === 'Once') queryClient.invalidateQueries({ queryKey: REMINDERS_KEY });
  };
  // Steps, like a checklist (lib/reminders): ticks show right away, then save.
  const steps = stepsOf(s.med);
  const saved = ticksFor(s.med, stepSlot(s));
  const [local, setLocal] = useState(null);
  const pending = useRef(0);
  // The saved ticks take over again once nothing is still saving.
  useEffect(() => { if (!pending.current) setLocal(null); }, [s.med.steps_done]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticked = local ?? saved;
  const doneSteps = steps.filter((x) => ticked.includes(x)).length;
  // One save at a time, so quick taps don't undo each other.
  const queue = useRef(Promise.resolve());
  const toggle = (step) => {
    if (busy) return;
    const on = !ticked.includes(step);
    const next = on ? [...ticked, step] : ticked.filter((x) => x !== step);
    setLocal(next);
    pending.current += 1;
    queue.current = queue.current.then(() => saveTick(step, on, next));
  };
  const saveTick = async (step, on, next) => {
    try {
      await tickStep(s, step, on);
      track('action', on ? 'tick:step' : 'untick:step');
      const all = steps.every((x) => next.includes(x));
      // The last step marks it done; unticking one brings a done one back.
      if (all && s.status !== 'taken') await mark('taken');
      else if (!all && s.status === 'taken') await mark('due');
    } catch (e) {
      setLocal(null);
      toast({ title: "Couldn't save that", description: plainError(e), variant: 'destructive' });
    } finally {
      pending.current -= 1;
      if (!pending.current) queryClient.invalidateQueries({ queryKey: REMINDERS_KEY });
    }
  };
  // Undo right after the last tick finished it: that tick comes off too.
  const undo = async () => {
    if (steps.length && steps.every((x) => ticked.includes(x))) {
      setLocal(ticked.slice(0, -1));
      try { await untickLast(s); } catch { /* Undo still goes through */ }
    }
    await mark('due');
    queryClient.invalidateQueries({ queryKey: REMINDERS_KEY });
  };
  // An "until it's done" reminder still waiting from an earlier day.
  const carried = s.med.frequency === 'Once' && s.med.once_date && s.med.once_date < s.day;

  return (
    <div data-focus={focus ? 'true' : undefined} className={`relative overflow-hidden rounded-2xl ${tint} border border-border/50 ${done ? 'opacity-60' : ''} transition-shadow duration-500 ${focus ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
      {color && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => onOpen?.(s.med)} className="w-full text-left">
            <p className={`font-medium text-sm leading-snug ${s.status === 'taken' ? 'line-through' : ''}`}>{s.med.medication_name}{s.med.dosage ? ` · ${s.med.dosage}` : ''}</p>
            <p className={`text-xs mt-1 ${late && !done ? 'text-destructive' : 'text-muted-foreground'}`}>
              {[s.med.family_member_name, nags ? "until it's done" : fmtClock(s.time), next ? `next reminder ${fmtClock(next)}` : '', carried ? `waiting since ${format(parseISO(s.med.once_date), 'EEE, MMM d')}` : ''].filter(Boolean).join(' · ')}
              {s.status === 'taken' && s.log?.taken_by_name ? ` · done by ${s.log.taken_by_name.split(' ')[0]}` : ''}
              {s.status === 'skipped' ? ' · skipped' : ''}
              {s.status === 'missed' ? ' · not done yet' : ''}
              {steps.length > 0 ? ` · ${doneSteps} of ${steps.length} steps` : ''}
              {s.med.visibility === 'private' && <span className="inline-flex items-center gap-0.5 ml-1"><Lock className="w-3 h-3" /> Only me</span>}
            </p>
          </button>
          {steps.length > 0 && (
            <ul className="mt-2 space-y-0.5" aria-label="Steps">
              {steps.map((st) => {
                const on = ticked.includes(st);
                return (
                  <li key={st}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(st)} disabled={busy}
                      className="w-full flex items-center gap-2.5 py-1.5 text-left">
                      <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-primary/50 bg-card'}`}>
                        {on && <Check className="w-4 h-4" />}
                      </span>
                      <span className={`text-sm min-w-0 break-words ${on ? 'line-through text-muted-foreground' : ''}`}>{st}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Done and Skip (a word, not an x that looks like close), in one row under the words. No "I'll take it":
              that's for events only (Anna, Nov 17 2026: taking a reminder "doesn't make sense"). */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {done ? (
              <DoneButton done busy={busy} onUndo={undo} label={s.med.medication_name} />
            ) : (
              <>
                <DoneButton busy={busy} onDone={() => mark('taken')} label={s.med.medication_name} />
                <Button type="button" variant="outline" size="sm" onClick={() => mark('skipped')} disabled={busy} className="rounded-xl bg-card">Skip</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

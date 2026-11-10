import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CalendarDays, BellRing } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { aroundKey, listEventsAround } from '@/lib/events';
import { expandAppointments } from '@/lib/occurrences';
import { REMINDERS_KEY, listReminders, slotsForDay, todayStr, fmtClock, markSlot, isPrivate } from '@/lib/reminders';
import { claimDayFor, claimOn, checkOn, firstName } from '@/lib/claims';
import { shownTitle } from '@/lib/eventTitle';
import { eventTiming, useNow } from '@/lib/eventTiming';

// Their day in one place, at the top of a cared-for person's Care Log (Anna,
// Nov 10 2026: "just as effective as a senior care tracker"): today's
// reminders for them (their medicine, most likely) with who marked each one
// done, and their appointments today with who's taking them. Same data as
// To-do and the Calendar, so marking one here marks it there too.

export default function PersonToday({ person, members = [] }) {
  const qc = useQueryClient();
  const { me, members: accounts } = useFamily();
  const now = useNow();
  const day = todayStr();
  const [busy, setBusy] = useState('');
  const { data: reminders = [] } = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders });
  const { data: logs = [] } = useQuery({ queryKey: ['reminderLogs', 'day', day], queryFn: () => base44.entities.MedicationLog.filter({ day }, '-day', 300) });
  const { data: events = [] } = useQuery({ queryKey: aroundKey(), queryFn: listEventsAround });

  const mine = reminders.filter((m) => m.family_member_id === person.id && !(isPrivate(m) && m.owner_user_id !== me?.id && m.created_by_id !== me?.id));
  const slots = slotsForDay(mine, logs, day);
  const appts = expandAppointments(events, new Date(), new Date())
    .filter((a) => a.family_member_id === person.id && !a.away_of)
    .sort((a, b) => (a.all_day ? -1 : 0) - (b.all_day ? -1 : 0) || String(a.time || '').localeCompare(String(b.time || '')));
  if (!slots.length && !appts.length) return null;

  const mark = async (slot, status) => {
    setBusy(slot.key);
    try {
      await markSlot(slot, status, me);
      qc.invalidateQueries({ queryKey: ['reminderLogs'] });
      qc.invalidateQueries({ queryKey: REMINDERS_KEY });
    } catch {
      toast({ title: "Couldn't save that", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3" aria-label={`${firstName(person.name)} today`}>
      {slots.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-1.5"><BellRing className="w-4 h-4 text-emerald-600" /> Reminders today</h2>
          <ul className="space-y-1.5">
            {slots.map((s) => {
              const done = s.status === 'taken';
              return (
                <li key={s.key} className={`flex items-center gap-3 ${done ? 'opacity-60' : ''}`}>
                  <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{fmtClock(s.time)}</span>
                  <span className={`text-sm flex-1 min-w-0 truncate ${done ? 'line-through' : ''}`}>{s.med.medication_name}{s.med.dosage ? ` · ${s.med.dosage}` : ''}</span>
                  {done ? (
                    <button type="button" className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 flex-shrink-0" disabled={busy === s.key} onClick={() => mark(s, 'due')} aria-label="Undo">
                      <Check className="w-3.5 h-3.5" /> {firstName(s.log?.taken_by_name) || 'Done'}
                    </button>
                  ) : (
                    <Button size="sm" variant="secondary" className="h-8 rounded-full flex-shrink-0" disabled={busy === s.key} onClick={() => mark(s, 'taken')}>Done</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {appts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-1.5"><CalendarDays className="w-4 h-4 text-primary" /> Today on the calendar</h2>
          <ul className="space-y-1.5">
            {appts.map((a) => {
              const over = !!checkOn(a, a.date) || eventTiming(a, now) === 'past';
              const taker = claimOn(a, claimDayFor('event', a, a.date), accounts);
              return (
                <li key={a.id}>
                  <Link to={`/calendar?date=${a.date}&event=${a.occurrence_of || a.id}`} className={`flex items-center gap-3 ${over ? 'opacity-60' : ''}`}>
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{a.all_day || !a.time ? 'All day' : fmtClock(String(a.time).slice(0, 5))}</span>
                    <span className="text-sm flex-1 min-w-0 truncate">{shownTitle(a, members, true)}</span>
                    {taker && <span className="text-xs text-muted-foreground flex-shrink-0">{taker.user_id === me?.id ? 'You' : firstName(taker.name)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

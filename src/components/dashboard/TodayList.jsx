import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check } from 'lucide-react';
import { getEventLightColorClass } from '@/utils/memberColors';
import { useFamily } from '@/lib/family';
import { expandAppointments } from '@/lib/occurrences';
import { aroundKey, listEventsAround } from '@/lib/events';
import { categoryOf } from '@/components/calendar/EventRow';
import { checkOn } from '@/lib/claims';
import { shownTitle } from '@/lib/eventTitle';
import { eventTiming, useNow } from '@/lib/eventTiming';
import { isOpen, isStep, sectionOf } from '@/lib/tasks';
import { slotsForDay, todayStr } from '@/lib/reminders';
import ReminderSlotCard from '@/components/reminders/ReminderSlotCard';
import useReminderEditor from '@/components/reminders/useReminderEditor';
import TaskCard from '@/components/tasks/TaskCard';

/**
 * Today Across the Family and To-do in one list (Anna, Nov 23 2026: "Is there
 * a way to combine today across the family and todo?"). The day in order:
 *   1. what's still to come: the family's events and today's reminders at a
 *      time, by time (all-day events first), each reminder with Done and Skip;
 *   2. "Still to do": reminders that keep going until they're done, and open
 *      to-dos due today, overdue or with no date (like the bottom of a day on
 *      the Calendar);
 *   3. what's over, checked off or done, faded, at the bottom (Undo still there).
 * A busy day shows its first few, then "See more" (closed again on the next visit).
 */
const ALL_UP_TO = 8;
const FIRST = 6;

const minutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? +m[1] * 60 + +m[2] : 0; };
const clock = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? format(new Date(2000, 0, 1, +m[1], +m[2]), 'h:mm a') : ''; };

export default function TodayList({ tasks = [], members = [] }) {
  const navigate = useNavigate();
  const { members: accounts } = useFamily();
  const now = useNow();
  const today = todayStr();
  const { data: appts = [], isLoading } = useQuery({ queryKey: aroundKey(), queryFn: listEventsAround });
  const { reminders, logs, editor, openReminder } = useReminderEditor(members);
  const [more, setMore] = useState(false);

  const { coming, still, over } = useMemo(() => {
    const coming = [];
    const still = [];
    const over = [];

    // Events today (each day of a repeating or multi-day one counts).
    for (const a of expandAppointments(appts, new Date(), new Date())) {
      if (a.date !== today) continue;
      const allDay = !!a.all_day || !a.time;
      const cat = categoryOf(a);
      const item = {
        kind: 'event', key: `ev-${a.id}`, a, allDay,
        at: allDay ? -1 : minutes(a.time),
        who: a.family_member_name || (a.visibility === 'private' ? 'You' : String(a.created_by_name || '').split(' ')[0]),
        label: cat && cat !== 'Other' ? cat : 'Event',
        tint: a.visibility === 'private' ? 'bg-muted/40' : getEventLightColorClass(a, members, accounts),
        detail: [shownTitle(a, members, !!a.family_member_name), allDay ? 'All day' : ''].filter(Boolean).join(' · '),
        timing: eventTiming(a, now),
        done: !!checkOn(a, a.date),
      };
      (item.done || item.timing === 'past' ? over : coming).push(item);
    }

    // Today's reminders: at a time, or "until it's done".
    for (const s of slotsForDay(reminders, logs, today)) {
      const finished = s.status === 'taken' || s.status === 'skipped';
      const item = { kind: 'slot', key: `rm-${s.key}`, s, at: minutes(s.time) };
      if (finished) over.push(item);
      else if (Array.isArray(s.nags)) still.push(item);
      else coming.push(item);
    }

    // Open to-dos due today, overdue or with no date.
    for (const t of tasks) {
      if (isOpen(t) && !isStep(t) && t.kind !== 'checklist' && ['today', 'nodate'].includes(sectionOf(t))) still.push({ kind: 'task', key: `tk-${t.id}`, t });
    }

    coming.sort((x, y) => x.at - y.at);
    over.sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
    return { coming, still, over };
  }, [appts, reminders, logs, tasks, members, accounts, today, now]);

  const eventRow = (i) => {
    const faded = i.done || i.timing === 'past';
    const when = i.allDay ? '' : clock(i.a.time);
    return (
      <div key={i.key} className={`flex items-center gap-3 p-2.5 rounded-xl ${i.tint} ${faded ? 'opacity-60' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{i.who || 'Family'} <span className="text-muted-foreground font-normal">· {i.label}</span></p>
          {i.detail && <p className="text-xs text-muted-foreground line-clamp-2">{i.detail}</p>}
        </div>
        <span className="flex flex-col items-end flex-shrink-0 text-xs text-muted-foreground">
          {when && <span className={faded ? 'line-through' : ''}>{when}</span>}
          {i.done
            ? <span className="inline-flex items-center gap-0.5 font-medium text-emerald-700 dark:text-emerald-300"><Check className="w-3 h-3" /> Done</span>
            : i.timing === 'past' ? <span>Past</span>
            : i.timing === 'now' ? <span className="font-semibold text-primary">Now</span>
            : null}
        </span>
      </div>
    );
  };
  // A to-do opens on the Reminders page, glowing (the task editor lives there).
  const row = (i) => (i.kind === 'event' ? eventRow(i)
    : i.kind === 'slot' ? <ReminderSlotCard key={i.key} slot={i.s} members={members} onOpen={openReminder} />
    : <TaskCard key={i.key} task={i.t} members={members} onOpen={(task) => navigate(`/tasks?highlight=${encodeURIComponent(task.id)}`)} />);

  if (isLoading) return <><div className="py-8 text-center text-sm text-muted-foreground">Loading today…</div>{editor}</>;
  const nothing = !coming.length && !still.length && !over.length;

  // The list in order, with "Still to do" and a gap before what's over.
  const seq = [
    ...coming.map((i) => ({ i })),
    ...(still.length ? [{ head: 'still' }] : []), ...still.map((i) => ({ i })),
    ...(over.length && (coming.length || still.length) ? [{ head: 'gap' }] : []), ...over.map((i) => ({ i })),
  ];
  const total = coming.length + still.length + over.length;
  const cut = !more && total > ALL_UP_TO;
  let shown = seq;
  if (cut) {
    let n = 0;
    shown = [];
    for (const x of seq) { if (x.i) { if (n === FIRST) break; n++; } shown.push(x); }
    while (shown.length && shown[shown.length - 1].head) shown.pop();
  }

  return (
    <>
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6" data-guide="home-todo">
        {nothing ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nothing scheduled today.</p>
        ) : (
          <div className="space-y-2">
            {!coming.length && !still.length && <p className="text-sm text-muted-foreground py-1">All done for today.</p>}
            {shown.map((x, k) => (x.head === 'still'
              ? <h3 key="still" className={`text-sm font-semibold text-muted-foreground ${k ? 'pt-3' : ''}`}>Still to do</h3>
              : x.head === 'gap' ? <div key="gap" className="h-2" aria-hidden="true" />
              : row(x.i)))}
            {cut && (
              <button type="button" onClick={() => setMore(true)} className="w-full h-11 rounded-xl text-base font-semibold text-primary hover:bg-muted">
                See more ({total - FIRST})
              </button>
            )}
          </div>
        )}
        <div className="text-right pt-3"><Link to="/tasks" className="text-sm text-primary hover:underline">Reminders page</Link></div>
      </div>
      {editor}
    </>
  );
}

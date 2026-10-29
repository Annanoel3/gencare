import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, ListChecks, Check, BellRing } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QuickAddTask from '@/components/shared/QuickAddTask';
import TaskCard from '@/components/tasks/TaskCard';
import TaskSheet from '@/components/tasks/TaskSheet';
import EventCard from '@/components/tasks/EventCard';
import ReminderSlotCard from '@/components/reminders/ReminderSlotCard';
import ReminderCard from '@/components/reminders/ReminderCard';
import useReminderEditor from '@/components/reminders/useReminderEditor';
import { SECTIONS, sectionOf, sortTasks, isOpen, isStep } from '@/lib/tasks';
import { slotsForDay, todayStr } from '@/lib/reminders';
import { aroundKey, listEventsAround } from '@/lib/events';
import { expandAppointments, rowIdOf } from '@/lib/occurrences';
import { startOfDay, addDays, parseISO, differenceInCalendarDays } from 'date-fns';

// This week's events, by the same day sections as tasks. A repeating or
// multi-day event shows once in "Next 7 days" (its first day there).
function eventsBySection(rows) {
  const today = startOfDay(new Date());
  const out = { today: [], tomorrow: [], week: [] };
  const seenInWeek = new Set();
  for (const o of expandAppointments(rows, today, addDays(today, 6))) {
    const diff = differenceInCalendarDays(parseISO(o.date), today);
    const key = diff <= 0 ? 'today' : diff === 1 ? 'tomorrow' : 'week';
    if (key === 'week') {
      const id = rowIdOf(o);
      if (seenInWeek.has(id)) continue;
      seenInWeek.add(id);
    }
    out[key].push(o);
  }
  return out;
}

// One day section in the order the day happens: by date (overdue tasks have
// earlier dates, so they lead "Today"), then all-day events, then everything
// with a clock time in time order (events, reminders, tasks, checklists), then
// the things with no time.
function orderDay(entries) {
  const rank = (e) => (e.allDay ? 0 : e.time ? 1 : 2);
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date || '9999').localeCompare(b.e.date || '9999')
      || rank(a.e) - rank(b.e)
      || (a.e.time || '').localeCompare(b.e.time || '')
      || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * To-do: the family's days in one list. Each day section holds that day's
 * events (tap to open on the calendar), today's set-time reminders (Done /
 * Skip), checklists and tasks, in time order; anyone in the family can tick
 * anything. The Reminders tab is where repeating reminders are added and
 * changed; the bell button adds one, and a push about one opens it here
 * (?reminder=<id>, or ?reminder=new).
 */
export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState({ open: false, task: null, kind: 'task' });
  const [tab, setTab] = useState(() => (params.get('tab') === 'reminders' ? 'reminders' : 'open'));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['careTasks', 'all'],
    queryFn: () => base44.entities.CareTask.list('-created_date', 500),
  });
  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });
  const { data: eventRows = [] } = useQuery({ queryKey: aroundKey(), queryFn: listEventsAround });
  const events = useMemo(() => eventsBySection(eventRows), [eventRows]);
  const { reminders, logs, isFetched, editor, openReminder } = useReminderEditor(members);
  const slots = useMemo(() => slotsForDay(reminders, logs, todayStr()), [reminders, logs]);

  // A reminder push, the + button's "Reminder", or an old /reminders link.
  const wanted = params.get('reminder');
  useEffect(() => {
    if (!wanted || !isFetched) return;
    if (wanted === 'new') openReminder(null);
    else {
      const m = reminders.find((x) => x.id === wanted);
      if (m) openReminder(m);
      setTab('reminders');
    }
    const next = new URLSearchParams(params); next.delete('reminder'); setParams(next, { replace: true });
  }, [wanted, isFetched]);

  const { stepsByParent, tasks } = useMemo(() => {
    const stepsByParent = {};
    const tasks = [];
    for (const r of rows) {
      if (isStep(r)) (stepsByParent[r.parent_task_id] ||= []).push(r);
      else tasks.push(r);
    }
    return { stepsByParent, tasks };
  }, [rows]);

  const open = sortTasks(tasks.filter((t) => isOpen(t)));
  const completed = tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).slice(0, 60);
  const today = todayStr();
  const slotsLeft = slots.filter((s) => s.status !== 'taken' && s.status !== 'skipped').length;

  const bySection = SECTIONS.map((s) => {
    const entries = [
      ...(events[s.key] || []).map((ev) => ({ kind: 'event', key: `ev-${ev.id}-${ev.date}`, date: ev.date, time: ev.all_day ? '' : ev.time || '', allDay: !!ev.all_day || !ev.time, ev })),
      ...(s.key === 'today' ? slots.map((sl) => ({ kind: 'slot', key: `rm-${sl.key}`, date: today, time: sl.time, slot: sl })) : []),
      ...open.filter((t) => sectionOf(t) === s.key).map((t) => ({ kind: 'task', key: t.id, date: t.due_date || '', time: t.due_time || '', task: t })),
    ];
    return { ...s, entries: orderDay(entries) };
  }).filter((s) => s.entries.length);

  const openTask = (task) => setSheet({ open: true, task, kind: task.kind || 'task' });
  const newTask = (kind) => setSheet({ open: true, task: null, kind });
  const paused = reminders.filter((m) => m.is_active === false);
  // Active reminders by who they're for, "Everyone" last.
  const byPerson = useMemo(() => {
    const groups = new Map();
    for (const m of reminders.filter((x) => x.is_active !== false)) {
      const k = m.family_member_name || 'Everyone';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === 'Everyone') - (b === 'Everyone') || a.localeCompare(b));
  }, [reminders]);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-primary" />
            To-do
          </h1>
          <p className="text-muted-foreground mt-1">Events, reminders and things to do. Anyone in the family can tick them off.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="icon" onClick={() => openReminder(null)} className="rounded-xl" aria-label="New reminder"><BellRing className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => newTask('checklist')} className="rounded-xl" aria-label="New checklist"><ListChecks className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => newTask('task')} className="rounded-xl" aria-label="New task with details"><Plus className="w-4 h-4" /></Button>
        </div>
      </div>

      <QuickAddTask autoFocus className="mb-6" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted rounded-xl mb-5 w-full grid grid-cols-3 h-auto p-1">
          <TabsTrigger value="open" className="rounded-lg py-1.5">To do ({open.length + slotsLeft})</TabsTrigger>
          <TabsTrigger value="done" className="rounded-lg py-1.5">Done ({completed.length})</TabsTrigger>
          <TabsTrigger value="reminders" className="rounded-lg py-1.5">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-6">
          {!isLoading && bySection.length === 0 && (
            <div className="text-center py-16">
              <Check className="w-14 h-14 mx-auto mb-3 text-emerald-500/30" />
              <h2 className="font-heading text-xl font-semibold mb-1">All caught up</h2>
              <p className="text-muted-foreground text-sm">Type something above, like "take the trash out", and anyone in the family can check it off.</p>
            </div>
          )}

          {bySection.map((s) => (
            <section key={s.key}>
              <h2 className="font-heading text-base font-semibold mb-2">{s.label} <span className="text-muted-foreground font-normal text-sm">({s.entries.length})</span></h2>
              <div className="space-y-2">
                {s.entries.map((e) => (
                  e.kind === 'event' ? <EventCard key={e.key} appt={e.ev} members={members} showDay={s.key === 'week'} />
                    : e.kind === 'slot' ? <ReminderSlotCard key={e.key} slot={e.slot} members={members} onOpen={openReminder} />
                    : <TaskCard key={e.key} task={e.task} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[e.task.id] || []} />
                ))}
              </div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="done">
          {completed.length === 0 ? (
            <p className="text-muted-foreground text-center py-10 text-sm">Nothing finished yet.</p>
          ) : (
            <div className="space-y-2">
              {completed.map((t) => <TaskCard key={t.id} task={t} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[t.id] || []} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reminders" className="space-y-3">
          <p className="text-sm text-muted-foreground">Things that happen at set times, like pills at 8 or feeding the dog at 7. They show up in To do on their days, and everyone gets a reminder.</p>
          <Button onClick={() => openReminder(null)} className="rounded-xl gap-2 w-full"><BellRing className="w-4 h-4" /> New reminder</Button>
          {byPerson.map(([who, list]) => (
            <section key={who} className="space-y-2 pt-1">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{who}</h2>
              {list.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => openReminder(m)} />)}
            </section>
          ))}
          {paused.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Paused ({paused.length})</h2>
              {paused.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => openReminder(m)} inactive />)}
            </>
          )}
        </TabsContent>
      </Tabs>

      <TaskSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} task={sheet.task} kind={sheet.kind} members={members} />
      {editor}
    </div>
  );
}

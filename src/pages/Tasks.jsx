import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, ListChecks, Check, BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import TodaySlots from '@/components/reminders/TodaySlots';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QuickAddTask from '@/components/shared/QuickAddTask';
import TaskCard from '@/components/tasks/TaskCard';
import TaskSheet from '@/components/tasks/TaskSheet';
import EventCard from '@/components/tasks/EventCard';
import { SECTIONS, sectionOf, sortTasks, isOpen, isStep } from '@/lib/tasks';
import { aroundKey, listEventsAround } from '@/lib/events';
import { expandAppointments, rowIdOf } from '@/lib/occurrences';
import { startOfDay, addDays, parseISO, differenceInCalendarDays } from 'date-fns';

// This week's events, by the same day sections as tasks. A repeating or
// multi-day event shows once in "Next 7 days" (its first day there).
function eventsBySection(rows) {
  const today = startOfDay(new Date());
  const out = { today: [], tomorrow: [], week: [] };
  const seenInWeek = new Set();
  const occ = expandAppointments(rows, today, addDays(today, 6))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || Number(!a.all_day && !!a.time) - Number(!b.all_day && !!b.time) || (a.time || '').localeCompare(b.time || ''));
  for (const o of occ) {
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

// A day's events first, then its tasks; across days, in date order (overdue
// tasks have earlier dates, so they still lead "Today").
function mergeByDay(events, tasks) {
  const day = (x) => (x.event ? x.event.date : x.task.due_date) || '9999';
  const list = [...events.map((event) => ({ event })), ...tasks.map((task) => ({ task }))];
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (day(a.x) < day(b.x) ? -1 : day(a.x) > day(b.x) ? 1 : a.i - b.i))
    .map(({ x }) => x);
}

/**
 * Tasks: everything the family needs to do, grouped by day, plus the family
 * checklists (routines anyone ticks off) at the top. Tick to finish, tap to
 * edit. Steps live inside a task; checklists show theirs on the card. The
 * week's events sit in the same days (tap one to open it on the calendar).
 */
export default function Tasks() {
  const [sheet, setSheet] = useState({ open: false, task: null, kind: 'task' });

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
  const eventCount = events.today.length + events.tomorrow.length + events.week.length;

  const { stepsByParent, tasks } = useMemo(() => {
    const stepsByParent = {};
    const tasks = [];
    for (const r of rows) {
      if (isStep(r)) (stepsByParent[r.parent_task_id] ||= []).push(r);
      else tasks.push(r);
    }
    return { stepsByParent, tasks };
  }, [rows]);

  const checklists = sortTasks(tasks.filter((t) => t.kind === 'checklist' && isOpen(t)));
  const open = sortTasks(tasks.filter((t) => t.kind !== 'checklist' && isOpen(t)));
  const completed = tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).slice(0, 60);
  const bySection = SECTIONS
    .map((s) => ({ ...s, items: open.filter((t) => sectionOf(t) === s.key), events: events[s.key] || [] }))
    .filter((s) => s.items.length || s.events.length);

  const openTask = (task) => setSheet({ open: true, task, kind: task.kind || 'task' });
  const newTask = (kind) => setSheet({ open: true, task: null, kind });

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-primary" />
            To-do
          </h1>
          <p className="text-muted-foreground mt-1">Events, reminders and things to do. Anyone in the family can tick them off.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="rounded-xl gap-2"><Link to="/reminders" aria-label="Reminders"><BellRing className="w-4 h-4" /><span className="hidden sm:inline">Reminders</span></Link></Button>
          <Button variant="outline" onClick={() => newTask('checklist')} className="rounded-xl gap-2"><ListChecks className="w-4 h-4" /><span className="hidden sm:inline">New checklist</span></Button>
          <Button variant="outline" onClick={() => newTask('task')} className="rounded-xl gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Details</span></Button>
        </div>
      </div>

      <QuickAddTask autoFocus className="mb-6" />

      <Tabs defaultValue="open">
        <TabsList className="bg-muted rounded-xl mb-5">
          <TabsTrigger value="open" className="rounded-lg">To do ({open.length + checklists.length})</TabsTrigger>
          <TabsTrigger value="done" className="rounded-lg">Done ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-6">
          {checklists.length > 0 && (
            <section>
              <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" /> Family checklists</h2>
              <div className="space-y-3">
                {checklists.map((t) => <TaskCard key={t.id} task={t} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[t.id] || []} />)}
              </div>
            </section>
          )}

          {/* Today's set-time reminders (from Reminders): Done / Skip, anyone can. */}
          <TodaySlots title="Today's reminders" members={members} />

          {!isLoading && open.length === 0 && checklists.length === 0 && eventCount === 0 && (
            <div className="text-center py-16">
              <Check className="w-14 h-14 mx-auto mb-3 text-emerald-500/30" />
              <h2 className="font-heading text-xl font-semibold mb-1">All caught up</h2>
              <p className="text-muted-foreground text-sm">Type a task above, or make a checklist the family shares.</p>
            </div>
          )}

          {bySection.map((s) => (
            <section key={s.key}>
              <h2 className="font-heading text-base font-semibold mb-2">{s.label} <span className="text-muted-foreground font-normal text-sm">({s.items.length + s.events.length})</span></h2>
              <div className="space-y-2">
                {mergeByDay(s.events, s.items).map((x) => (x.event
                  ? <EventCard key={`ev-${x.event.id}-${x.event.date}`} appt={x.event} members={members} showDay={s.key === 'week'} />
                  : <TaskCard key={x.task.id} task={x.task} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[x.task.id] || []} />))}
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
      </Tabs>

      <TaskSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} task={sheet.task} kind={sheet.kind} members={members} />
    </div>
  );
}

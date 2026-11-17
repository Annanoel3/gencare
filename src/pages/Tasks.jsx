import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, Check, BellRing } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import TaskCard from '@/components/tasks/TaskCard';
import TaskSheet from '@/components/tasks/TaskSheet';
import EventCard from '@/components/tasks/EventCard';
import ReminderSlotCard from '@/components/reminders/ReminderSlotCard';
import ReminderCard from '@/components/reminders/ReminderCard';
import useReminderEditor from '@/components/reminders/useReminderEditor';
import useEventEditor from '@/components/calendar/useEventEditor';
import { SECTIONS, sectionOf, sortTasks, isOpen, isStep } from '@/lib/tasks';
import { slotsForDay, todayStr, isFinishedOnce, isEnded, defaultTimes } from '@/lib/reminders';
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
 * anything. "Every reminder" at the bottom is where repeating reminders are seen and
 * changed; the bell button adds one, and a push about one opens it here
 * (?reminder=<id>, or ?reminder=new).
 */
export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState({ open: false, task: null, kind: 'task' });
  const [quick, setQuick] = useState('');
  // To-do and reminders are one list, called Reminders (Anna, Nov 14 2026: "To
  // do and reminders should be combined and just called reminders"): what's
  // coming up, then every reminder (the old Reminders tab), and Done.
  const [tab, setTab] = useState('open');

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
  // Tapping an event opens it right here, no trip to the Calendar.
  const { openEvent, editor: eventEditor } = useEventEditor(members);
  const openOccurrence = (occ) => openEvent(eventRows.find((r) => r.id === rowIdOf(occ)) || occ);
  const slots = useMemo(() => slotsForDay(reminders, logs, todayStr()), [reminders, logs]);

  // The + button's "Task" lands here with ?task=new.
  useEffect(() => {
    if (params.get('task') !== 'new') return;
    setSheet({ open: true, task: null, kind: 'task' });
    const next = new URLSearchParams(params); next.delete('task'); setParams(next, { replace: true });
  }, [params.get('task')]);

  // A reminder push, the + button's "Reminder", or an old /reminders link.
  const wanted = params.get('reminder');
  useEffect(() => {
    if (!wanted || !isFetched) return;
    if (wanted === 'new') openReminder(null);
    else {
      const m = reminders.find((x) => x.id === wanted);
      if (m) openReminder(m);
      setTab('open');
    }
    const next = new URLSearchParams(params); next.delete('reminder'); setParams(next, { replace: true });
  }, [wanted, isFetched]);

  // A push (or Who did what) lands on the thing itself, glowing for a moment,
  // not its edit popup (Anna, Oct 31 2026): ?highlight=<reminder or task id>.
  const [focusId, setFocusId] = useState('');
  const highlight = params.get('highlight');
  useEffect(() => {
    if (!highlight || !isFetched || isLoading) return;
    const next = new URLSearchParams(params); next.delete('highlight'); setParams(next, { replace: true });
    const inToday = slots.some((sl) => sl.med.id === highlight);
    const reminder = reminders.find((m) => m.id === highlight);
    const task = rows.find((t) => t.id === highlight);
    setTab(task?.status === 'completed' && !inToday && !reminder ? 'done' : 'open');
    setFocusId(highlight);
  }, [highlight, isFetched, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusId) return undefined;
    const t1 = setTimeout(() => document.querySelector('[data-focus="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    const t2 = setTimeout(() => setFocusId(''), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focusId]);

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
  // Paused, or repeating ones past their last day (Stop repeating).
  const paused = reminders.filter((m) => (m.is_active === false || isEnded(m)) && !isFinishedOnce(m));
  // Active reminders by who they're for; ones for nobody in particular last.
  const byPerson = useMemo(() => {
    const groups = new Map();
    // "Until it's done" reminders drop off the list once someone finishes them.
    for (const m of reminders.filter((x) => x.is_active !== false && !isFinishedOnce(x) && !isEnded(x))) {
      const k = m.family_member_name || 'General';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === 'General') - (b === 'General') || a.localeCompare(b));
  }, [reminders]);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3 min-w-0">
            <BellRing className="w-7 h-7 text-primary flex-shrink-0" />
            Reminders
          </h1>
          {/* Words under the button (it was just a bell). A checklist is a reminder with steps now (Anna, Nov 14 2026). */}
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" onClick={() => openReminder(null)} className="rounded-xl h-auto w-[4.75rem] flex-col gap-0.5 px-1 py-1.5">
              <BellRing className="w-5 h-5" /><span className="text-xs font-medium">Reminder</span>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-1">Events, reminders and things to do. Anyone in the family can tick them off.</p>
      </div>

      {/* One way to add things: a reminder (Anna, Oct 29 2026: "get rid of the add task... people can
          just use reminders for things that would be tasks too"). Typing here opens it with the words in. */}
      {/* The + is always full color: with nothing typed it opens the full form (it used to sit pale and look broken). */}
      <form onSubmit={(e) => { e.preventDefault(); const t = quick.trim(); if (!t) { openReminder(null); return; } openReminder({ medication_name: t, frequency: 'Once', times: defaultTimes('Once') }); setQuick(''); }} className="flex items-center gap-2 mb-6">
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a reminder…" enterKeyHint="next" aria-label="New reminder" className="h-11 rounded-xl text-base" />
        <Button type="submit" size="icon" className="h-11 w-11 rounded-xl shrink-0" aria-label="Add reminder"><Plus className="w-5 h-5" /></Button>
      </form>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted rounded-xl mb-5 w-full grid grid-cols-2 h-auto p-1">
          <TabsTrigger value="open" className="rounded-lg py-1.5">Reminders ({open.length + slotsLeft})</TabsTrigger>
          <TabsTrigger value="done" className="rounded-lg py-1.5">Done ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-6">
          {!isLoading && bySection.length === 0 && (
            <div className="text-center py-16">
              <Check className="w-14 h-14 mx-auto mb-3 text-emerald-500/30" />
              <h2 className="font-heading text-xl font-semibold mb-1">All caught up</h2>
              <p className="text-muted-foreground text-sm">Type something above, like "pick up groceries", pick a time, and everyone gets reminded until someone marks it done.</p>
            </div>
          )}

          {bySection.map((s) => (
            <section key={s.key} data-section>
              <h2 className="font-heading text-base font-semibold mb-2">{s.label} <span className="text-muted-foreground font-normal text-sm">({s.entries.length})</span></h2>
              <div className="space-y-2">
                {s.entries.map((e) => (
                  e.kind === 'event' ? <EventCard key={e.key} appt={e.ev} members={members} showDay={s.key === 'week'} onOpen={openOccurrence} />
                    : e.kind === 'slot' ? <ReminderSlotCard key={e.key} slot={e.slot} members={members} onOpen={openReminder} focus={!!focusId && e.slot.med.id === focusId} />
                    : <TaskCard key={e.key} task={e.task} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[e.task.id] || []} focus={!!focusId && e.task.id === focusId} />
                ))}
              </div>
            </section>
          ))}

          {/* Every reminder, by who it's for (the old Reminders tab): where
              repeating ones are seen and changed. */}
          {(byPerson.length > 0 || paused.length > 0) && (
            <section className="space-y-2 pt-2 border-t border-border/60" data-section>
              <h2 className="font-heading text-base font-semibold pt-4">Every reminder</h2>
              <p className="text-sm text-muted-foreground">Things at set times, like a walk every morning at 8, and one-off jobs that keep reminding until someone marks them done. Tap one to change it.</p>
              {byPerson.map(([who, list]) => (
                <div key={who} className="space-y-2 pt-1">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{who}</h3>
                  {list.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => openReminder(m)} focus={!!focusId && m.id === focusId} />)}
                </div>
              ))}
              {paused.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Paused ({paused.length})</h3>
                  {paused.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => openReminder(m)} inactive focus={!!focusId && m.id === focusId} />)}
                </>
              )}
            </section>
          )}
        </TabsContent>

        <TabsContent value="done">
          {completed.length === 0 ? (
            <p className="text-muted-foreground text-center py-10 text-sm">Nothing finished yet.</p>
          ) : (
            <div className="space-y-2">
              {completed.map((t) => <TaskCard key={t.id} task={t} members={members} onOpen={openTask} stepsPreloaded={stepsByParent[t.id] || []} focus={!!focusId && t.id === focusId} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TaskSheet open={sheet.open} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} task={sheet.task} kind={sheet.kind} members={members} />
      {editor}
      {eventEditor}
    </div>
  );
}

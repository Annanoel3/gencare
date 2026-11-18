import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { isOpen, isStep, sectionOf } from '@/lib/tasks';
import { slotsForDay, todayStr } from '@/lib/reminders';
import { useNow } from '@/lib/eventTiming';
import ReminderSlotCard from '@/components/reminders/ReminderSlotCard';
import useReminderEditor from '@/components/reminders/useReminderEditor';
import TaskCard from '@/components/tasks/TaskCard';
import HomeSection from '@/components/dashboard/HomeSection';

/**
 * To-do on Home, under Today Across the Family (Anna, Nov 18 2026: "the to-do
 * list for all family members"): today's reminders for everyone in the family
 * (the same cards as the Reminders page, with Done and Skip), then any open
 * task due today, overdue or with no date. Events stay in Today Across the
 * Family. What's done today drops to the bottom of the open list (so Undo is
 * still there); the count and the closed preview are what's left to do.
 */
export default function TodoCard({ tasks = [], members = [] }) {
  const navigate = useNavigate();
  const now = useNow();
  const today = todayStr();
  const { reminders, logs, editor, openReminder } = useReminderEditor(members);
  const slots = useMemo(() => slotsForDay(reminders, logs, today), [reminders, logs, today, now]);

  const finished = (s) => s.status === 'taken' || s.status === 'skipped';
  const slotCard = (s) => <ReminderSlotCard key={`rm-${s.key}`} slot={s} members={members} onOpen={openReminder} />;
  // A task opens on the Reminders page, glowing (the task editor lives there).
  const taskCard = (t) => <TaskCard key={t.id} task={t} members={members} onOpen={(task) => navigate(`/tasks?highlight=${encodeURIComponent(task.id)}`)} />;

  const openTasks = tasks.filter((t) => isOpen(t) && !isStep(t) && t.kind !== 'checklist' && ['today', 'nodate'].includes(sectionOf(t)));
  const left = [...slots.filter((s) => !finished(s)).map(slotCard), ...openTasks.map(taskCard)];
  const doneToday = slots.filter(finished).map(slotCard);
  if (!left.length && !doneToday.length) return <>{editor}</>;
  const all = [...left, ...doneToday];

  return (
    <>
      <HomeSection
        title="To-do"
        icon={<ListChecks className="w-5 h-5 text-primary flex-shrink-0" />}
        count={left.length}
        preview={left[0] || <p className="text-sm text-muted-foreground py-1">All done for today.</p>}
        // The same small gap between the two as in the opened list (Anna, Nov 18 2026).
        previewNext={(left[0] ? all[1] : doneToday[0]) ? <div className="pt-2">{left[0] ? all[1] : doneToday[0]}</div> : null}
        nextHeight="h-12"
      >
        {/* Opened, everything (Anna, Nov 17 2026: "Show more should just show the rest of the items"). */}
        <div className="space-y-2">{all}</div>
        <div className="text-right pt-2"><Link to="/tasks" className="text-sm text-primary hover:underline">Reminders page</Link></div>
      </HomeSection>
      {editor}
    </>
  );
}

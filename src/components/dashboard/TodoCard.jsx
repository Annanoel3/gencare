import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseISO, isValid, isToday, isPast, startOfDay, format } from 'date-fns';
import { useFamily } from '@/lib/family';
import { getMemberColorByMemberId } from '@/utils/memberColors';
import { completeTask, time12, PRIORITY_WORD } from '@/lib/tasks';
import DoneButton from '@/components/shared/DoneButton';

/**
 * The family's open tasks on the home page, newest-due first, tick to complete.
 * Tasks with no date (the ones the quick-add box makes) belong here too; the
 * care feed only shows things pinned to a day, so without this card they were
 * invisible until you opened the Tasks page.
 */
export default function TodoCard({ tasks = [], members = [], limit = 3 }) {
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const complete = useMutation({
    mutationFn: (task) => completeTask(task, me),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['careTasks'] }),
  });

  const open = tasks
    // Steps live under their task and family checklists live on the Tasks page.
    .filter(t => (t.status === 'pending' || t.status === 'in_progress') && !t.parent_task_id && t.kind !== 'checklist')
    .map(t => {
      const due = t.due_date ? parseISO(t.due_date) : null;
      return { ...t, due: due && isValid(due) ? due : null };
    })
    .sort((a, b) => {
      // overdue and today first, then upcoming by date, then undated (newest first)
      const rank = (t) => !t.due ? 2 : (isToday(t.due) || isPast(startOfDay(t.due)) ? 0 : 1);
      const d = rank(a) - rank(b);
      if (d) return d;
      if (a.due && b.due) return a.due - b.due;
      return (b.created_date || '').localeCompare(a.created_date || '');
    });

  if (open.length === 0) return null;
  const shown = open.slice(0, limit);

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6" data-section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Reminders</h2>
        <Link to="/tasks" className="text-sm text-primary hover:underline">All of them ({open.length})</Link>
      </div>
      <div className="space-y-1">
        {shown.map(t => {
          const overdue = t.due && !isToday(t.due) && isPast(startOfDay(t.due));
          const color = t.family_member_id ? getMemberColorByMemberId(t.family_member_id, members) : null;
          return (
            // With big text the Done button moves under the words instead of squeezing them.
            <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium title-fit">{t.title}</p>
                {/* Wraps instead of cutting off "High priority". */}
                <p className="text-xs text-muted-foreground">
                  {t.family_member_name && <span className="inline-flex items-center gap-1 mr-2">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{t.family_member_name}</span>}
                  {t.due && (
                    <span className={`whitespace-nowrap ${overdue ? 'text-destructive' : ''}`}>
                      {isToday(t.due) ? 'Today' : overdue ? `Overdue · ${format(t.due, 'MMM d')}` : format(t.due, 'MMM d')}
                      {t.due_time ? ` ${time12(t.due_time)}` : ''}
                    </span>
                  )}
                  {PRIORITY_WORD[t.priority] && <span className={`ml-2 font-medium whitespace-nowrap ${t.priority === 'urgent' ? 'text-destructive' : 'text-orange-600'}`}>{PRIORITY_WORD[t.priority]}</span>}
                </p>
              </div>
              {/* The same Done button as everywhere else (it used to be a small circle). */}
              <DoneButton busy={complete.isPending && complete.variables?.id === t.id} onDone={() => complete.mutate(t)} label={t.title} className="flex-shrink-0 ml-auto" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

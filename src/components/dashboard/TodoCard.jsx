import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseISO, isValid, isToday, isPast, startOfDay, format } from 'date-fns';
import { Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { getMemberColorByMemberId } from '@/utils/memberColors';
import { completeTask } from '@/lib/tasks';

/**
 * The family's open tasks on the home page, newest-due first, tick to complete.
 * Tasks with no date (the ones the quick-add box makes) belong here too; the
 * care feed only shows things pinned to a day, so without this card they were
 * invisible until you opened the Tasks page.
 */
export default function TodoCard({ tasks = [], members = [], limit = 8 }) {
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
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">To do</h2>
        <Link to="/tasks" className="text-sm text-primary hover:underline">All tasks ({open.length})</Link>
      </div>
      <div className="space-y-1">
        {shown.map(t => {
          const overdue = t.due && !isToday(t.due) && isPast(startOfDay(t.due));
          const color = t.family_member_id ? getMemberColorByMemberId(t.family_member_id, members) : null;
          return (
            <div key={t.id} className="flex items-center gap-3 py-2">
              <button
                onClick={() => complete.mutate(t)}
                disabled={complete.isPending}
                aria-label={`Mark "${t.title}" done`}
                className="w-6 h-6 rounded-full border-2 border-primary/40 hover:border-primary hover:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-all"
              >
                <Check className="w-3 h-3 text-primary opacity-0 hover:opacity-100" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.family_member_name && <span className="inline-flex items-center gap-1 mr-2">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{t.family_member_name}</span>}
                  {t.due && (
                    <span className={overdue ? 'text-destructive' : ''}>
                      {isToday(t.due) ? 'Today' : overdue ? `Overdue · ${format(t.due, 'MMM d')}` : format(t.due, 'MMM d')}
                      {t.due_time ? ` ${t.due_time}` : ''}
                    </span>
                  )}
                  {t.priority === 'urgent' && <span className="ml-2 text-destructive">Urgent</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

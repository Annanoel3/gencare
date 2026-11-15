import React, { useState } from 'react';
import { track } from '@/lib/activity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Repeat, ChevronDown, ChevronUp, User, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import TaskSteps from './TaskSteps';
import { completeTask, uncompleteTask, toggleStep, addStep, recurrenceLabel, isOverdue, dueDateOf, repeats, PRIORITY_WORD, time12 } from '@/lib/tasks';
import DoneButton from '@/components/shared/DoneButton';

const prioClass = { urgent: 'text-destructive', high: 'text-orange-600', medium: '', low: 'text-muted-foreground' };

/**
 * One task in a list. Tick = done (a repeat brings its next copy), tap = open.
 * A checklist shows its steps right on the card so anyone can tick them.
 */
export default function TaskCard({ task, members = [], onOpen, stepsPreloaded, focus = false }) {
  const { me } = useFamily();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [stepBusy, setStepBusy] = useState(null);
  const isChecklist = task.kind === 'checklist';
  const [expanded, setExpanded] = useState(isChecklist);
  const done = task.status === 'completed';

  // The Tasks page hands the steps in (one list query for everything); other
  // places let the card fetch its own.
  const stepsQ = useQuery({
    queryKey: ['careTasks', 'steps', task.id],
    queryFn: () => base44.entities.CareTask.filter({ parent_task_id: task.id }),
    enabled: !stepsPreloaded,
  });
  const steps = stepsPreloaded || stepsQ.data || [];
  const doneSteps = steps.filter((s) => s.status === 'completed').length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['careTasks'] });

  const tick = async (e) => {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try { if (done) await uncompleteTask(task); else await completeTask(task, me); track('action', done ? 'undo:task' : `done:${task.kind || 'task'}`); } finally { setBusy(false); }
    refresh();
  };
  const onToggleStep = async (s) => {
    setStepBusy(s.id);
    try { await toggleStep(s, steps, task, me); } finally { setStepBusy(null); }
    refresh();
  };
  const onAddStep = async (label) => { await addStep(task, label); refresh(); };

  const color = task.family_member_id ? getMemberColorByMemberId(task.family_member_id, members) : null;
  // The card is tinted with the person's color, like the home-page family rows.
  const tint = task.family_member_id ? getMemberLightColorByMemberId(task.family_member_id, members) : 'bg-card';
  const overdue = !done && isOverdue(task);
  const due = dueDateOf(task);
  const when = due ? `${overdue ? 'Overdue · ' : ''}${format(due, 'EEE, MMM d')}${task.due_time ? ` · ${time12(task.due_time)}` : ''}` : '';

  return (
    <div data-focus={focus ? 'true' : undefined} className={`relative overflow-hidden rounded-2xl ${tint} border border-border/50 ${done ? 'opacity-60' : ''} transition-shadow duration-500 ${focus ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
      {color && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <div className="flex-1 min-w-0">
          <button type="button" className="w-full text-left" onClick={() => onOpen?.(task)}>
            <p className={`font-medium text-sm leading-snug ${done ? 'line-through' : ''}`}>
              {isChecklist && <ListChecks className="inline w-4 h-4 mr-1 -mt-0.5 text-primary" />}
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              {task.family_member_name && <span className="inline-flex items-center gap-1">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{task.family_member_name}</span>}
              {when && <span className={overdue ? 'text-destructive font-medium' : ''}>{when}</span>}
              {repeats(task) && <span className="inline-flex items-center gap-0.5"><Repeat className="w-3 h-3" />{recurrenceLabel(task)}</span>}
              {task.assigned_to && <span className="inline-flex items-center gap-0.5"><User className="w-3 h-3" />Assigned to {task.assigned_to.split(' ')[0]}</span>}
              {PRIORITY_WORD[task.priority] && <span className={`font-medium ${prioClass[task.priority]}`}>{PRIORITY_WORD[task.priority]}</span>}
              {steps.length > 0 && !isChecklist && <span>{doneSteps}/{steps.length} steps</span>}
              {done && task.completed_by_name && <span>done by {task.completed_by_name.split(' ')[0]}</span>}
            </div>
          </button>
          {/* The same Done button as reminders (it was a small circle on the left). */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <DoneButton done={done} busy={busy} onDone={tick} onUndo={tick} label={task.title} />
          </div>
        </div>
        {steps.length > 0 && !isChecklist && (
          <button onClick={() => setExpanded((v) => !v)} aria-label="Show steps" className="p-1 text-muted-foreground">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
        )}
      </div>
      {(isChecklist || expanded) && (
        <div className="px-4 pb-3">
          {isChecklist && steps.length > 0 && (
            <div className="h-1.5 rounded-full bg-muted mb-2 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${steps.length ? (doneSteps / steps.length) * 100 : 0}%` }} /></div>
          )}
          <TaskSteps steps={steps} onToggle={onToggleStep} onAdd={isChecklist ? onAddStep : undefined} busyId={stepBusy} canEdit={isChecklist} compact />
          {isChecklist && steps.length === 0 && <p className="text-xs text-muted-foreground">No steps yet. Add the things to tick off.</p>}
        </div>
      )}
    </div>
  );
}

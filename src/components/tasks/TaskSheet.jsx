import React, { useEffect, useState } from 'react';
import { track } from '@/lib/activity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, Check, Repeat, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily, orderMembers } from '@/lib/family';
import { isPet } from '@/utils/memberColors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NotesField from '@/components/shared/NotesField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TaskSteps from './TaskSteps';
import { Choices } from '@/components/shared/MoreOptions';
import { format, addDays } from 'date-fns';
import {
  REPEAT_OPTIONS, DAY_NAMES, createTask, updateTask, deleteTask, addStep,
  completeTask, uncompleteTask, toggleStep, nextCopyText, clean,
} from '@/lib/tasks';

const NONE = '__none__';
const WHEN = [['none', 'No date'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', 'Pick a day']];

/**
 * Create or edit a task or checklist. Up front: what and when (a checklist
 * also shows its steps and how often). Then who does it, who it's for and
 * notes, nothing else (Anna, Oct 29 2026: folding extras under "More options"
 * isn't the fix; priority and category are gone, and a value an older task
 * already has is kept). Repeat is a small link. `task` null = new.
 * `kind` ('task' | 'checklist') applies to a new one.
 */
export default function TaskSheet({ open, onOpenChange, task = null, kind = 'task', members = [], onChanged }) {
  const { me, members: accounts = [] } = useFamily();
  const queryClient = useQueryClient();
  const isNew = !task;
  const [form, setForm] = useState(blank(kind));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stepBusy, setStepBusy] = useState(null);
  // An older task that's already for a pet keeps showing its pet.
  const forPeople = orderMembers(members, me?.id).filter((m) => !isPet(m) || m.id === form.family_member_id);
  const [pendingSteps, setPendingSteps] = useState([]); // steps typed before a new task exists

  useEffect(() => {
    if (!open) return;
    setForm(task ? fromTask(task) : blank(kind));
    setPendingSteps([]);
  }, [open, task, kind]);

  const stepsQ = useQuery({
    queryKey: ['careTasks', 'steps', task?.id],
    queryFn: () => base44.entities.CareTask.filter({ parent_task_id: task.id }),
    enabled: !!task?.id && open,
  });
  const steps = stepsQ.data || [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['careTasks'] });
    onChanged?.();
  };

  const save = useMutation({
    mutationFn: async () => {
      const member = members.find((m) => m.id === form.family_member_id);
      const account = accounts.find((a) => a.id === form.assigned_user_id);
      const data = clean({
        title: form.title.trim(),
        description: form.description,
        notes: form.notes,
        kind: form.kind,
        priority: form.priority,
        category: form.category,
        due_date: form.due_date,
        due_time: form.due_time,
        family_member_id: form.family_member_id === NONE ? '' : form.family_member_id,
        family_member_name: form.family_member_id === NONE ? '' : (member?.name || ''),
        assigned_user_id: form.assigned_user_id === NONE ? '' : form.assigned_user_id,
        assigned_to: form.assigned_user_id === NONE ? '' : (account?.full_name || ''),
        recurrence: form.recurrence,
        recurrence_days: form.recurrence === 'weekly' && form.recurrence_days.length ? form.recurrence_days : undefined,
      });
      if (isNew) {
        const created = await createTask(data);
        for (const label of pendingSteps) await addStep(created, label);
        return created;
      }
      // On edit, cleared fields must reach the server as null.
      const patch = { ...data };
      for (const k of ['due_date', 'due_time', 'family_member_id', 'family_member_name', 'assigned_user_id', 'assigned_to', 'description', 'notes', 'recurrence_days']) {
        if (!(k in patch)) patch[k] = null;
      }
      return updateTask(task.id, patch, { before: task });
    },
    onSuccess: () => { track('action', isNew ? `add:${form.kind || 'task'}` : 'edit:task', [form.due_date ? 'dated' : '', form.due_time ? 'timed' : '', form.recurrence !== 'none' ? 'repeats' : ''].filter(Boolean).join(' ')); refresh(); onOpenChange(false); },
  });

  const remove = useMutation({ mutationFn: () => deleteTask(task), onSuccess: () => { track('action', 'delete:task'); refresh(); setConfirmDelete(false); onOpenChange(false); } });
  const finish = useMutation({ mutationFn: () => completeTask(task, me), onSuccess: () => { refresh(); onOpenChange(false); } });
  const reopen = useMutation({ mutationFn: () => uncompleteTask(task), onSuccess: () => { refresh(); onOpenChange(false); } });

  const onToggleStep = async (s) => {
    setStepBusy(s.id);
    try { await toggleStep(s, steps, task, me); } finally { setStepBusy(null); }
    stepsQ.refetch(); refresh();
  };
  const onAddStep = async (label) => {
    if (isNew) { setPendingSteps((p) => [...p, label]); return; }
    await addStep(task, label); stepsQ.refetch();
  };
  const onRemoveStep = async (s) => { await base44.entities.CareTask.delete(s.id); stepsQ.refetch(); refresh(); };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (n) => set('recurrence_days', form.recurrence_days.includes(n) ? form.recurrence_days.filter((d) => d !== n) : [...form.recurrence_days, n].sort());
  const isChecklist = form.kind === 'checklist';
  const done = task?.status === 'completed';
  const [showTime, setShowTime] = useState(false);
  useEffect(() => { if (open) setShowTime(false); }, [open, task]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const [picking, setPicking] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  useEffect(() => { if (open) { setPicking(false); setShowRepeat(false); } }, [open, task]);
  const when = picking ? 'pick' : !form.due_date ? 'none' : form.due_date === today ? 'today' : form.due_date === tomorrow ? 'tomorrow' : 'pick';
  const setWhen = (v) => {
    setPicking(v === 'pick');
    if (v === 'none') setForm((f) => ({ ...f, due_date: '', due_time: '' }));
    else if (v === 'today') set('due_date', today);
    else if (v === 'tomorrow') set('due_date', tomorrow);
    else if (!form.due_date || form.due_date === today || form.due_date === tomorrow) set('due_date', format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  };
  const repeatField = (
    <div>
      <Label className="flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> Repeats</Label>
      <Select value={form.recurrence} onValueChange={(v) => set('recurrence', v)}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>{REPEAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {form.recurrence === 'weekly' && (
        <div className="flex gap-1.5 mt-2">
          {DAY_NAMES.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(i)} className={`h-8 w-9 rounded-lg text-xs font-medium border ${form.recurrence_days.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{d}</button>
          ))}
        </div>
      )}
      {form.recurrence !== 'none' && !form.due_date && <p className="text-xs text-muted-foreground mt-1">Starts today; finishing it brings the next one.</p>}
      {!isNew && form.recurrence !== 'none' && <p className="text-xs text-muted-foreground mt-1">{nextCopyText({ ...task, ...form })}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{isNew ? (isChecklist ? 'New checklist' : 'New task') : (isChecklist ? 'Checklist' : 'Task')}</DialogTitle>
          <DialogDescription className="sr-only">Edit the task</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <div>
            <Label>{isChecklist ? 'Checklist name' : 'What needs doing'} *</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} className="mt-1" placeholder={isChecklist ? 'Morning routine' : 'Pick up the dry cleaning'} />
          </div>

          <div>
            <Label>{isChecklist ? 'Starts' : 'When'}</Label>
            <Choices value={when} options={WHEN} onChange={setWhen} className="mt-1.5" />
            {(when === 'pick' || (form.due_date && (form.due_time || showTime))) && (
              <div className="flex gap-3 mt-2">
                {when === 'pick' && <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} aria-label="Day" className="flex-1" />}
                {form.due_date && (form.due_time || showTime) && <Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} aria-label="Time" className="flex-1" />}
              </div>
            )}
            {form.due_date && !form.due_time && !showTime && <button type="button" onClick={() => { setShowTime(true); set('due_time', `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`); }} className="text-sm text-primary font-medium mt-2">+ Add a time (sends a push)</button>}
            {form.due_date && form.due_time && <p className="text-xs text-muted-foreground mt-1">{form.assigned_user_id && form.assigned_user_id !== NONE ? 'The person doing it gets' : 'Everyone gets'} a push at that time.</p>}
          </div>

          {(isChecklist || steps.length > 0) && (
            <div>
              <Label>Steps (anyone can tick them)</Label>
              <div className="mt-1 rounded-xl border border-border/60 p-3">
                {isNew && pendingSteps.length > 0 && (
                  <ul className="mb-1 space-y-1">{pendingSteps.map((p, i) => <li key={i} className="text-sm flex items-center gap-2"><span className="w-5 h-5 rounded-md border-2 border-primary/40 inline-block" />{p}</li>)}</ul>
                )}
                <TaskSteps steps={steps} onToggle={isNew ? undefined : onToggleStep} onAdd={onAddStep} onRemove={isNew ? undefined : onRemoveStep} busyId={stepBusy} />
              </div>
            </div>
          )}

          {isChecklist || form.recurrence !== 'none' || showRepeat ? repeatField
            : <button type="button" onClick={() => setShowRepeat(true)} className="text-sm text-primary font-medium flex items-center gap-1 -mt-1"><Repeat className="w-3.5 h-3.5" /> Repeat</button>}

          <div>
            <Label>Who does it</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <Pill on={!form.assigned_user_id || form.assigned_user_id === NONE} onClick={() => set('assigned_user_id', NONE)}>Anyone</Pill>
              {accounts.map((a) => <Pill key={a.id} on={form.assigned_user_id === a.id} onClick={() => set('assigned_user_id', a.id)}>{a.id === me?.id ? 'Me' : String(a.display_name || a.full_name || '').split(' ')[0]}</Pill>)}
            </div>
            {forPeople.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mt-2.5 mb-1.5">For</p>
                <div className="flex flex-wrap gap-2">
                  <Pill on={!form.family_member_id || form.family_member_id === NONE} onClick={() => set('family_member_id', NONE)}>Whole family</Pill>
                  {/* People only (Anna, Oct 29 2026: pets don't belong here); you first. */}
                  {forPeople.map((m) => <Pill key={m.id} on={form.family_member_id === m.id} onClick={() => set('family_member_id', m.id)}>{String(m.name || '').split(' ')[0]}</Pill>)}
                </div>
              </>
            )}
          </div>

          <NotesField value={form.notes} onChange={(v) => set('notes', v)} placeholder="Anything the person doing it should know" resetKey={`${open}${task?.id || ''}`} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isNew && (
              <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>
            )}
            {!isNew && !done && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => finish.mutate()} disabled={finish.isPending}>{finish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark done</Button>
            )}
            {!isNew && done && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => reopen.mutate()} disabled={reopen.isPending}><RotateCcw className="w-4 h-4" /> Not done yet</Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title.trim() || save.isPending}>{save.isPending ? 'Saving…' : isNew ? 'Add' : 'Save'}</Button>
          </div>
          {save.isError && <p className="text-xs text-destructive">Couldn't save: {save.error?.message || 'try again'}</p>}
        </div>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{task?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>Its steps go with it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function blank(kind) {
  return { title: '', description: '', notes: '', kind, priority: 'medium', category: kind === 'checklist' ? 'Personal Care' : 'Other', due_date: '', due_time: '', family_member_id: NONE, assigned_user_id: NONE, recurrence: kind === 'checklist' ? 'daily' : 'none', recurrence_days: [] };
}

function fromTask(t) {
  return {
    title: t.title || '', description: t.description || '', notes: t.notes || '', kind: t.kind || 'task',
    priority: t.priority || 'medium', category: t.category || 'Other',
    due_date: t.due_date || '', due_time: t.due_time || '',
    family_member_id: t.family_member_id || NONE, assigned_user_id: t.assigned_user_id || NONE,
    recurrence: (t.is_recurring === false && t.kind !== 'checklist') ? 'none' : (t.recurrence || 'none'),
    recurrence_days: Array.isArray(t.recurrence_days) ? t.recurrence_days : [],
  };
}

function Pill({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`}>{children}</button>
  );
}

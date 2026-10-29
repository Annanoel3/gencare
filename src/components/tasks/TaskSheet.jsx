import React, { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TaskSteps from './TaskSteps';
import {
  REPEAT_OPTIONS, DAY_NAMES, PRIORITIES, CATEGORIES, createTask, updateTask, deleteTask, addStep,
  completeTask, uncompleteTask, toggleStep, nextCopyText, clean,
} from '@/lib/tasks';

const NONE = '__none__';

/**
 * Create or edit a task or checklist: title, who it is for, who does it, when,
 * how often, priority, notes, and its steps. `task` null = new.
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
    onSuccess: () => { refresh(); onOpenChange(false); },
  });

  const remove = useMutation({ mutationFn: () => deleteTask(task), onSuccess: () => { refresh(); setConfirmDelete(false); onOpenChange(false); } });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{isNew ? (isChecklist ? 'New checklist' : 'New task') : (isChecklist ? 'Checklist' : 'Task')}</DialogTitle>
          <DialogDescription className="sr-only">Edit the task</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <div>
            <Label>{isChecklist ? 'Checklist name' : 'What needs doing'} *</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} className="mt-1" autoFocus={isNew} placeholder={isChecklist ? 'Morning routine' : 'Pick up the dry cleaning'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>For</Label>
              <Select value={form.family_member_id || NONE} onValueChange={(v) => set('family_member_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Anyone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Whole family</SelectItem>
                  {/* People only (Anna, Oct 29 2026: pets don't belong here); you first. */}
                  {forPeople.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Who does it</Label>
              <Select value={form.assigned_user_id || NONE} onValueChange={(v) => set('assigned_user_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Anyone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Anyone</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}{a.id === me?.id ? ' (me)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>{isChecklist ? 'Starts' : 'Due date'}</Label><Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="mt-1" /></div>
            <div><Label>Time{form.due_time ? '' : ' (reminder)'}</Label><Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} className="mt-1" disabled={!form.due_date} /></div>
          </div>
          {form.due_date && form.due_time && <p className="text-xs text-muted-foreground -mt-2">{form.assigned_user_id && form.assigned_user_id !== NONE ? 'The person it is assigned to gets' : 'Everyone gets'} a push at that time.</p>}

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{isChecklist ? 'Steps (anyone can tick them)' : 'Steps'}</Label>
            <div className="mt-1 rounded-xl border border-border/60 p-3">
              {isNew && pendingSteps.length > 0 && (
                <ul className="mb-1 space-y-1">{pendingSteps.map((p, i) => <li key={i} className="text-sm flex items-center gap-2"><span className="w-5 h-5 rounded-md border-2 border-primary/40 inline-block" />{p}</li>)}</ul>
              )}
              <TaskSteps steps={steps} onToggle={isNew ? undefined : onToggleStep} onAdd={onAddStep} onRemove={isNew ? undefined : onRemoveStep} busyId={stepBusy} />
            </div>
          </div>

          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" rows={2} placeholder="Anything the person doing it should know" /></div>

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

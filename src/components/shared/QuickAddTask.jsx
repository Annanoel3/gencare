import React, { useState } from 'react';
import { track } from '@/lib/activity';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * One-line "add a task" box: type, press Enter (or tap +), done. Everything
 * else about the task (priority, who it's for, due date) is optional and can
 * be set later from the Tasks page. Used on the home page and the Tasks page.
 */
export default function QuickAddTask({ placeholder = 'Add a task…', autoFocus = false, className = '' }) {
  const [title, setTitle] = useState('');
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: (t) => base44.entities.CareTask.create(withFamily({ title: t, priority: 'medium', category: 'Other', status: 'pending' })),
    onSuccess: (created) => {
      setTitle('');
      track('action', 'add:task (quick)');
      queryClient.invalidateQueries({ queryKey: ['careTasks'] });
      if (created?.id) base44.functions.invoke('notifyFamily', { kind: 'task', action: 'added', task_id: created.id }).catch(() => {});
    },
  });

  const submit = (e) => {
    e?.preventDefault?.();
    const t = title.trim();
    if (!t || add.isPending) return;
    add.mutate(t);
  };

  return (
    <form onSubmit={submit} className={`flex items-center gap-2 ${className}`}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        aria-label="New task"
        className="h-11 rounded-xl text-base"
      />
      <Button type="submit" size="icon" disabled={!title.trim() || add.isPending} className="h-11 w-11 rounded-xl shrink-0" aria-label="Add task">
        {add.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
      </Button>
      {add.isError && <span className="text-xs text-destructive">Couldn't save, try again</span>}
    </form>
  );
}

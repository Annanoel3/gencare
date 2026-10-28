import React, { useState } from 'react';
import { Check, Plus, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * The steps inside a task or checklist: tick, add, remove. `steps` are
 * CareTask rows with parent_task_id; the parent decides what happens when the
 * last one is ticked (lib/tasks toggleStep).
 */
export default function TaskSteps({ steps = [], onToggle, onAdd, onRemove, busyId, canEdit = true, compact = false }) {
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const sorted = [...steps].sort((a, b) => (a.subtask_order || 0) - (b.subtask_order || 0));

  const submit = async (e) => {
    e?.preventDefault?.();
    const t = label.trim();
    if (!t || adding) return;
    setAdding(true);
    try { await onAdd(t); setLabel(''); } finally { setAdding(false); }
  };

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {sorted.map((s) => {
        const done = s.status === 'completed';
        return (
          <div key={s.id} className="group flex items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => onToggle(s)}
              disabled={busyId === s.id}
              aria-label={done ? `Untick ${s.title}` : `Tick ${s.title}`}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${done ? 'bg-primary border-primary' : 'border-primary/40 hover:border-primary'}`}
            >
              {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : done ? <Check className="w-3 h-3 text-primary-foreground" /> : null}
            </button>
            <span className={`flex-1 text-sm ${done ? 'line-through text-muted-foreground' : ''}`}>{s.title}</span>
            {done && s.completed_by_name && <span className="text-[11px] text-muted-foreground">{s.completed_by_name.split(' ')[0]}</span>}
            {canEdit && onRemove && (
              <button type="button" onClick={() => onRemove(s)} aria-label={`Remove step ${s.title}`} className="p-1 rounded text-muted-foreground/60 hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      {canEdit && onAdd && (
        <form onSubmit={submit} className="flex items-center gap-2 pt-1">
          <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a step…" className="h-9 text-sm" enterKeyHint="done" />
        </form>
      )}
    </div>
  );
}

import React from 'react';

export default function FamilyProgressBar({ checklists, items }) {
  if (checklists.length === 0) return null;

  const total = items.length;
  const checked = items.filter(i => i.is_checked).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const allDone = total > 0 && checked === total;

  // Per-checklist mini stats
  const stats = checklists.map(cl => {
    const clItems = items.filter(i => i.checklist_id === cl.id);
    const done = clItems.filter(i => i.is_checked).length;
    return { ...cl, done, total: clItems.length };
  }).filter(s => s.total > 0);

  return (
    <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-foreground">
          {allDone ? "All done for today! 🎉" : "Today's Progress"}
        </h2>
        <span className="text-lg font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-3 bg-primary/10 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-700 ${allDone ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {stats.map(s => {
          const sDone = s.done === s.total;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                sDone
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-white text-muted-foreground border-border'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sDone ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              {s.title}
              <span className="font-medium">{s.done}/{s.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
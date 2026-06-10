import React, { useState } from 'react';
import { Check, Trash2, RotateCcw, ChevronDown, ChevronUp, Plus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_COLORS = {
  Medication: { bg: 'bg-blue-50 border-blue-200', bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700', check: 'bg-blue-500 border-blue-500' },
  Meals: { bg: 'bg-amber-50 border-amber-200', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', check: 'bg-amber-500 border-amber-500' },
  School: { bg: 'bg-purple-50 border-purple-200', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700', check: 'bg-purple-500 border-purple-500' },
  'Personal Care': { bg: 'bg-pink-50 border-pink-200', bar: 'bg-pink-500', badge: 'bg-pink-100 text-pink-700', check: 'bg-pink-500 border-pink-500' },
  'Pet Care': { bg: 'bg-orange-50 border-orange-200', bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', check: 'bg-orange-500 border-orange-500' },
  'Elderly Care': { bg: 'bg-teal-50 border-teal-200', bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700', check: 'bg-teal-500 border-teal-500' },
  Other: { bg: 'bg-slate-50 border-slate-200', bar: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700', check: 'bg-slate-500 border-slate-500' },
};

const CATEGORY_EMOJI = {
  Medication: '💊', Meals: '🍽️', School: '🎒', 'Personal Care': '🧼',
  'Pet Care': '🐾', 'Elderly Care': '🤝', Other: '📋',
};

export default function ChecklistCard({ checklist, items, currentUser, onToggle, onReset, onDelete, onAddItem, onDeleteItem }) {
  const [collapsed, setCollapsed] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const colors = CATEGORY_COLORS[checklist.category] || CATEGORY_COLORS.Other;
  const emoji = CATEGORY_EMOJI[checklist.category] || '📋';

  const checkedCount = items.filter(i => i.is_checked).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  const allDone = total > 0 && checkedCount === total;

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddItem(checklist.id, newLabel.trim());
    setNewLabel('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 ${colors.bg} overflow-hidden`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl leading-none mt-0.5">{emoji}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base leading-tight">{checklist.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                  {checklist.category}
                </span>
                {checklist.family_member_name && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" />{checklist.family_member_name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground capitalize">
                  {checklist.reset_frequency === 'never' ? 'No reset' : `Resets ${checklist.reset_frequency}`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onReset(checklist.id)}
              title="Reset all"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(checklist.id)}
              title="Delete checklist"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-black/5 transition-all"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{checkedCount}/{total} done</span>
            {allDone && <span className="text-emerald-600 font-semibold">All done! 🎉</span>}
          </div>
          <div className="h-2 bg-black/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : colors.bar}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2 space-y-0.5 border-t border-black/5 pt-2">
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No items yet — add one below.</p>
              )}
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2 group rounded-lg px-1 hover:bg-black/5 transition-colors">
                  <button
                    onClick={() => onToggle(item, !item.is_checked, currentUser)}
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                      item.is_checked
                        ? `${colors.check} scale-105`
                        : 'border-muted-foreground/40 hover:border-primary'
                    }`}
                  >
                    {item.is_checked && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.label}
                  </span>
                  {item.is_checked && item.checked_by && (
                    <span className="text-xs text-muted-foreground hidden group-hover:flex items-center gap-1">
                      <User className="w-2.5 h-2.5" />{item.checked_by}
                    </span>
                  )}
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add item */}
            <div className="px-4 pb-4 pt-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a task..."
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  className="h-8 text-sm bg-white/70 rounded-lg"
                />
                <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg" disabled={!newLabel.trim()} onClick={handleAdd}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
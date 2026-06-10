import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckSquare, Plus, Check, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_COLORS = {
  Medication: { bg: 'bg-blue-50 border-blue-200', accent: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  Meals: { bg: 'bg-amber-50 border-amber-200', accent: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  School: { bg: 'bg-purple-50 border-purple-200', accent: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  'Personal Care': { bg: 'bg-pink-50 border-pink-200', accent: 'bg-pink-500', badge: 'bg-pink-100 text-pink-700' },
  'Pet Care': { bg: 'bg-orange-50 border-orange-200', accent: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  'Elderly Care': { bg: 'bg-teal-50 border-teal-200', accent: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' },
  Other: { bg: 'bg-muted/50 border-border', accent: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

const categories = ['Medication', 'Meals', 'School', 'Personal Care', 'Pet Care', 'Elderly Care', 'Other'];

const today = () => new Date().toISOString().slice(0, 10);

export default function Checklists() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Other', family_member_id: '', reset_frequency: 'daily' });
  const [newItemLabels, setNewItemLabels] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const queryClient = useQueryClient();

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => base44.entities.Checklist.filter({ is_active: true }, '-created_date'),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['checklistItems'],
    queryFn: () => base44.entities.ChecklistItem.list('-sort_order', 500),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });

  const createChecklist = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      return base44.entities.Checklist.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setCreateOpen(false);
      setForm({ title: '', category: 'Other', family_member_id: '', reset_frequency: 'daily' });
    },
  });

  const deleteChecklist = useMutation({
    mutationFn: (id) => base44.entities.Checklist.update(id, { is_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklists'] }),
  });

  const addItem = useMutation({
    mutationFn: ({ checklist_id, label }) =>
      base44.entities.ChecklistItem.create({ checklist_id, label, is_checked: false, sort_order: Date.now() }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['checklistItems'] });
      setNewItemLabels(prev => ({ ...prev, [vars.checklist_id]: '' }));
    },
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, is_checked }) =>
      base44.entities.ChecklistItem.update(id, {
        is_checked,
        checked_at: is_checked ? new Date().toISOString() : null,
        checked_by: is_checked ? 'Family Member' : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.ChecklistItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const resetChecklist = useMutation({
    mutationFn: async (checklist_id) => {
      const its = items.filter(i => i.checklist_id === checklist_id && i.is_checked);
      await Promise.all(its.map(i =>
        base44.entities.ChecklistItem.update(i.id, { is_checked: false, checked_at: null, checked_by: null, last_reset_date: today() })
      ));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  // Auto-reset daily checklists
  const getItemsForChecklist = (checklist_id, reset_frequency) => {
    const its = items.filter(i => i.checklist_id === checklist_id);
    if (reset_frequency === 'daily') {
      return its.map(item => {
        if (item.is_checked && item.last_reset_date !== today()) {
          // Reset locally for display (actual reset happens on next toggle)
          return { ...item, is_checked: false };
        }
        return item;
      });
    }
    return its;
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <CheckSquare className="w-7 h-7 text-primary" />
            Checklists
          </h1>
          <p className="text-muted-foreground mt-1">Daily routines and care checklists for your family.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> New Checklist
        </Button>
      </div>

      {checklists.length === 0 ? (
        <div className="text-center py-20">
          <CheckSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No checklists yet</h2>
          <p className="text-muted-foreground mb-6">Create your first checklist for medications, meals, school prep, and more.</p>
          <Button onClick={() => setCreateOpen(true)} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Create Checklist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {checklists.map((cl, idx) => {
            const colors = CATEGORY_COLORS[cl.category] || CATEGORY_COLORS.Other;
            const clItems = getItemsForChecklist(cl.id, cl.reset_frequency);
            const checkedCount = clItems.filter(i => i.is_checked).length;
            const total = clItems.length;
            const progress = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
            const isCollapsed = collapsed[cl.id];

            return (
              <motion.div
                key={cl.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`rounded-2xl border-2 ${colors.bg} overflow-hidden`}
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{cl.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>{cl.category}</span>
                        {cl.family_member_name && (
                          <span className="text-xs text-muted-foreground">for {cl.family_member_name}</span>
                        )}
                        {cl.reset_frequency !== 'never' && (
                          <span className="text-xs text-muted-foreground capitalize">{cl.reset_frequency} reset</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => resetChecklist.mutate(cl.id)}
                        title="Reset all"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteChecklist.mutate(cl.id)}
                        title="Delete checklist"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCollapsed(prev => ({ ...prev, [cl.id]: !isCollapsed }))}
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-black/5 transition-all"
                      >
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {total > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{checkedCount}/{total} done</span>
                        {progress === 100 && <span className="text-emerald-600 font-medium">All done! 🎉</span>}
                      </div>
                      <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${colors.accent}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Items */}
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-2 space-y-1">
                        {clItems.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">No items yet. Add one below.</p>
                        )}
                        {clItems.map(item => (
                          <div key={item.id} className="flex items-center gap-3 py-2 group">
                            <button
                              onClick={() => toggleItem.mutate({ id: item.id, is_checked: !item.is_checked })}
                              className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                                item.is_checked
                                  ? 'bg-emerald-500 border-emerald-500'
                                  : 'border-muted-foreground/40 hover:border-primary'
                              }`}
                            >
                              {item.is_checked && <Check className="w-3 h-3 text-white" />}
                            </button>
                            <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-muted-foreground' : ''}`}>
                              {item.label}
                            </span>
                            {item.is_checked && item.checked_by && (
                              <span className="text-xs text-muted-foreground hidden group-hover:inline">✓ {item.checked_by}</span>
                            )}
                            <button
                              onClick={() => deleteItem.mutate(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add item input */}
                      <div className="px-4 pb-4 pt-1">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add item..."
                            value={newItemLabels[cl.id] || ''}
                            onChange={e => setNewItemLabels(prev => ({ ...prev, [cl.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newItemLabels[cl.id]?.trim()) {
                                addItem.mutate({ checklist_id: cl.id, label: newItemLabels[cl.id].trim() });
                              }
                            }}
                            className="h-8 text-sm bg-white/70"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            disabled={!newItemLabels[cl.id]?.trim()}
                            onClick={() => {
                              if (newItemLabels[cl.id]?.trim()) {
                                addItem.mutate({ checklist_id: cl.id, label: newItemLabels[cl.id].trim() });
                              }
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Checklist Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">New Checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Morning Medications, School Prep..."
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Resets</Label>
                <Select value={form.reset_frequency} onValueChange={v => setForm({ ...form, reset_frequency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every Day</SelectItem>
                    <SelectItem value="weekly">Every Week</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>For Family Member (optional)</Label>
              <Select value={form.family_member_id} onValueChange={v => setForm({ ...form, family_member_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All family" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createChecklist.mutate(form)}
                disabled={!form.title || createChecklist.isPending}
              >
                {createChecklist.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
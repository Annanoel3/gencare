import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ChecklistCard from '@/components/checklists/ChecklistCard';
import FamilyProgressBar from '@/components/checklists/FamilyProgressBar';
import CreateChecklistDialog from '@/components/checklists/CreateChecklistDialog';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = { title: '', category: 'Other', family_member_id: '', reset_frequency: 'daily' };

export default function ChecklistsPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentUser, setCurrentUser] = useState('');
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const saved = localStorage.getItem('gencare_checklist_user');
    if (saved) setCurrentUser(saved);
  }, []);

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => base44.entities.Checklist.filter({ is_active: true }, '-created_date'),
  });

  const { data: rawItems = [] } = useQuery({
    queryKey: ['checklistItems'],
    queryFn: () => base44.entities.ChecklistItem.list('-sort_order', 500),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });

  const items = rawItems.map(item => {
    const cl = checklists.find(c => c.id === item.checklist_id);
    if (!cl) return item;
    if (cl.reset_frequency === 'daily' && item.is_checked && item.last_reset_date !== today()) {
      return { ...item, is_checked: false };
    }
    return item;
  });

  const createChecklist = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      const payload = { ...data, family_member_name: member?.name || '' };
      if (payload.family_member_id === 'all') payload.family_member_id = '';
      return base44.entities.Checklist.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteChecklist = useMutation({
    mutationFn: (id) => base44.entities.Checklist.update(id, { is_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklists'] }),
  });

  const addItem = useMutation({
    mutationFn: ({ checklist_id, label }) =>
      base44.entities.ChecklistItem.create({ checklist_id, label, is_checked: false, sort_order: Date.now() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, is_checked, userName }) =>
      base44.entities.ChecklistItem.update(id, {
        is_checked,
        checked_at: is_checked ? new Date().toISOString() : null,
        checked_by: is_checked ? (userName || 'Family') : null,
        last_reset_date: is_checked ? today() : undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.ChecklistItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const resetChecklist = useMutation({
    mutationFn: async (checklist_id) => {
      const its = rawItems.filter(i => i.checklist_id === checklist_id && i.is_checked);
      await Promise.all(its.map(i =>
        base44.entities.ChecklistItem.update(i.id, { is_checked: false, checked_at: null, checked_by: null, last_reset_date: today() })
      ));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklistItems'] }),
  });

  const handleToggle = (item, newState, userName) => {
    if (newState && !userName) {
      setPendingToggle({ item, newState });
      setNamePromptOpen(true);
      return;
    }
    toggleItem.mutate({ id: item.id, is_checked: newState, userName });
  };

  const confirmToggleWithName = (name) => {
    const saved = name.trim() || 'Family';
    localStorage.setItem('gencare_checklist_user', saved);
    setCurrentUser(saved);
    if (pendingToggle) {
      toggleItem.mutate({ id: pendingToggle.item.id, is_checked: pendingToggle.newState, userName: saved });
      setPendingToggle(null);
    }
    setNamePromptOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Checklists</h2>
          <p className="text-muted-foreground text-sm">Shared daily routines for the whole family.</p>
        </div>
        <div className="flex items-center gap-2">
          {currentUser && (
            <button
              onClick={() => { setCurrentUser(''); localStorage.removeItem('gencare_checklist_user'); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-2.5 py-1.5"
            >
              👤 {currentUser} <span className="ml-1 text-muted-foreground/60">×</span>
            </button>
          )}
          <Button onClick={() => setCreateOpen(true)} className="rounded-xl gap-2" size="sm">
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>
      </div>

      <FamilyProgressBar checklists={checklists} items={items} />

      {checklists.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-primary/50" />
          </div>
          <h3 className="font-heading text-lg font-semibold mb-1">No checklists yet</h3>
          <p className="text-muted-foreground mb-5 max-w-sm mx-auto text-sm">
            Create checklists for medications, pet feeding, school prep, and more.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="rounded-xl gap-2" size="sm">
            <Plus className="w-4 h-4" /> Create First Checklist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {checklists.map(cl => (
            <ChecklistCard
              key={cl.id}
              checklist={cl}
              items={items.filter(i => i.checklist_id === cl.id)}
              currentUser={currentUser}
              onToggle={handleToggle}
              onReset={(id) => resetChecklist.mutate(id)}
              onDelete={(id) => deleteChecklist.mutate(id)}
              onAddItem={(checklist_id, label) => addItem.mutate({ checklist_id, label })}
              onDeleteItem={(id) => deleteItem.mutate(id)}
            />
          ))}
        </div>
      )}

      <CreateChecklistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        setForm={setForm}
        members={members}
        onSubmit={() => createChecklist.mutate(form)}
        isPending={createChecklist.isPending}
      />

      <Dialog open={namePromptOpen} onOpenChange={setNamePromptOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Who's checking this off?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Your name will be saved for future check-offs on this device.</p>
          <NameInput onConfirm={confirmToggleWithName} onSkip={() => confirmToggleWithName('Family')} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NameInput({ onConfirm, onSkip }) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-3 pt-1">
      <Input
        placeholder="Your name..."
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onConfirm(name)}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onSkip}>Skip</Button>
        <Button size="sm" onClick={() => onConfirm(name)} disabled={!name.trim()}>Save & Check</Button>
      </div>
    </div>
  );
}
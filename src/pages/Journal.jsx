import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Star, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

const moodEmojis = { great: '😄', good: '🙂', okay: '😐', poor: '😟', bad: '😢' };
const categoryIcons = {
  Symptom: '🩺', Behavior: '🧠', Mood: '💭', 'Doctor Note': '📋',
  Observation: '👀', Milestone: '🎯', General: '📝',
};

export default function Journal() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ content: '', category: 'General', mood: '', family_member_id: '', is_important: false });
  const queryClient = useQueryClient();

  const { data: entries = [] } = useQuery({
    queryKey: ['careJournal'],
    queryFn: () => base44.entities.CareJournal.list('-created_date', 100),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      return base44.entities.CareJournal.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['careJournal'] });
      setDialogOpen(false);
      setForm({ content: '', category: 'General', mood: '', family_member_id: '', is_important: false });
    },
  });

  const filtered = entries.filter(e =>
    !search || e.content?.toLowerCase().includes(search.toLowerCase()) || e.family_member_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-primary" />
            Care Journal
          </h1>
          <p className="text-muted-foreground mt-1">Log observations, symptoms, and milestones.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Entry</Button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search journal entries..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">{search ? 'No matching entries' : 'Start your care journal'}</h2>
          <p className="text-muted-foreground mb-6">{search ? 'Try a different search term.' : 'Record your first observation or note.'}</p>
          {!search && <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Entry</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((entry, i) => (
            <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{categoryIcons[entry.category] || '📝'}</span>
                    <Badge variant="secondary" className="text-xs">{entry.category}</Badge>
                    {entry.family_member_name && <Badge variant="outline" className="text-xs">{entry.family_member_name}</Badge>}
                    {entry.mood && <span className="text-lg" title={entry.mood}>{moodEmojis[entry.mood]}</span>}
                  </div>
                  {entry.is_important && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{entry.content}</p>
                <p className="text-xs text-muted-foreground mt-3">
                  {entry.created_date ? format(parseISO(entry.created_date), 'EEEE, MMM d, yyyy · h:mm a') : ''}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl">New Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Entry *</Label><Textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="What did you observe today?" className="mt-1 min-h-[120px]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(categoryIcons).map(c => <SelectItem key={c} value={c}>{categoryIcons[c]} {c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mood</Label>
                <Select value={form.mood} onValueChange={v => setForm({...form, mood: v})}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(moodEmojis).map(([k, v]) => <SelectItem key={k} value={k}>{v} {k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Family Member</Label>
              <Select value={form.family_member_id} onValueChange={v => setForm({...form, family_member_id: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_important} onChange={e => setForm({...form, is_important: e.target.checked})} className="rounded" />
              <span className="text-sm">Mark as important</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.content || createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Save Entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ClipboardList, Plus, Check, Circle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';

const priorityConfig = {
  low: { color: 'bg-blue-500/10 text-blue-600 border-blue-200', icon: Circle },
  medium: { color: 'bg-amber-500/10 text-amber-600 border-amber-200', icon: Clock },
  high: { color: 'bg-orange-500/10 text-orange-600 border-orange-200', icon: AlertTriangle },
  urgent: { color: 'bg-red-500/10 text-red-600 border-red-200', icon: AlertTriangle },
};

const categories = ['Medical', 'School', 'Grocery', 'Household', 'Transportation', 'Financial', 'Personal Care', 'Other'];

export default function Tasks() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', category: 'Other', due_date: '', assigned_to: '', family_member_id: '' });
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['careTasks'],
    queryFn: () => base44.entities.CareTask.list('-created_date', 100),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      return base44.entities.CareTask.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['careTasks'] });
      setDialogOpen(false);
      setForm({ title: '', description: '', priority: 'medium', category: 'Other', due_date: '', assigned_to: '', family_member_id: '' });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id) => base44.entities.CareTask.update(id, { status: 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['careTasks'] }),
  });

  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-primary" />
            Tasks
          </h1>
          <p className="text-muted-foreground mt-1">Keep track of everything that needs to get done.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Task</Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="bg-muted rounded-xl mb-6">
          <TabsTrigger value="pending" className="rounded-lg">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? (
            <div className="text-center py-20">
              <Check className="w-16 h-16 mx-auto mb-4 text-emerald-500/30" />
              <h2 className="font-heading text-xl font-semibold mb-2">All caught up!</h2>
              <p className="text-muted-foreground">No pending tasks. Great job!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((task, i) => (
                <TaskCard key={task.id} task={task} i={i} onComplete={() => completeMutation.mutate(task.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completed.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No completed tasks yet.</p>
          ) : (
            <div className="space-y-3">
              {completed.map((task, i) => (
                <TaskCard key={task.id} task={task} i={i} completed />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl">New Task</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="mt-1" /></div>
              <div><Label>Assigned To</Label><Input value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})} placeholder="Name" className="mt-1" /></div>
            </div>
            <div>
              <Label>For Family Member</Label>
              <Select value={form.family_member_id} onValueChange={v => setForm({...form, family_member_id: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.title || createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({ task, i, onComplete, completed }) {
  const config = priorityConfig[task.priority] || priorityConfig.medium;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
      <div className={`flex items-start gap-3 p-4 rounded-2xl bg-card border border-border/50 ${completed ? 'opacity-50' : ''}`}>
        {!completed && (
          <button onClick={onComplete} className="mt-0.5 w-6 h-6 rounded-full border-2 border-primary/40 hover:border-primary hover:bg-primary/10 flex items-center justify-center transition-all flex-shrink-0">
            <Check className="w-3 h-3 text-primary opacity-0 hover:opacity-100" />
          </button>
        )}
        {completed && (
          <div className="mt-0.5 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${completed ? 'line-through' : ''}`}>{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={`text-xs ${config.color}`}>{task.priority}</Badge>
            {task.category && task.category !== 'Other' && <Badge variant="secondary" className="text-xs">{task.category}</Badge>}
            {task.family_member_name && <Badge variant="secondary" className="text-xs">{task.family_member_name}</Badge>}
            {task.assigned_to && <span className="text-xs text-muted-foreground">→ {task.assigned_to}</span>}
            {task.due_date && <span className="text-xs text-muted-foreground">{task.due_date}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
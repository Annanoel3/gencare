import React, { useState } from 'react';
import { Plus, X, FileText, Calendar, BellRing, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { withFamily, useFamily } from '@/lib/family';
import { authorOf, todayStr } from '@/lib/journal';
import { createTask } from '@/lib/tasks';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

const captureOptions = [
  { icon: FileText, label: 'Quick Note', type: 'note', color: 'bg-blue-500' },
  { icon: Calendar, label: 'Appointment', type: 'appointment', color: 'bg-purple-500' },
  { icon: BellRing, label: 'Reminder', type: 'reminder', color: 'bg-emerald-500' },
  { icon: MessageSquare, label: 'Task', type: 'task', color: 'bg-orange-500' },
];

export default function QuickCaptureButton() {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [captureType, setCaptureType] = useState(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const navigate = useNavigate();

  const handleOptionClick = (type) => {
    if (type === 'reminder') { setExpanded(false); navigate('/reminders?new=1'); return; }
    setCaptureType(type);
    setDialogOpen(true);
    setExpanded(false);
    setContent('');
    setTitle('');
    setDate('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (captureType === 'note') {
        // Quick notes used to go to a table nothing read; they are journal entries now.
        await base44.entities.CareJournal.create(withFamily({ content, category: 'General', entry_date: todayStr(), ...authorOf(me) }));
      } else if (captureType === 'task') {
        await createTask({ title: (title || content).trim(), description: title ? content : undefined, due_date: date || undefined });
      } else if (captureType === 'appointment') {
        await base44.entities.Appointment.create(withFamily({ title: (title || content).trim(), date, notes: title ? content : undefined }));
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
      queryClient.invalidateQueries();
      setDialogOpen(false);
      setCaptureType(null);
    } finally {
      setSaving(false);
    }
  };

  const typeLabels = { note: 'Quick Note', appointment: 'New Appointment', task: 'New Task' };

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-50 flex flex-col-reverse items-end gap-3">
        <AnimatePresence>
          {expanded && captureOptions.map((opt, i) => (
            <motion.button
              key={opt.type}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleOptionClick(opt.type)}
              className="flex items-center gap-3 bg-card shadow-lg rounded-full pl-4 pr-2 py-2 border border-border hover:shadow-xl transition-shadow"
            >
              <span className="text-sm font-medium text-foreground whitespace-nowrap">{opt.label}</span>
              <div className={`w-10 h-10 rounded-full ${opt.color} flex items-center justify-center`}>
                <opt.icon className="w-5 h-5 text-white" />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setExpanded(!expanded)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
            expanded ? 'bg-foreground rotate-45' : 'bg-primary'
          }`}
        >
          {expanded ? <X className="w-6 h-6 text-background" /> : <Plus className="w-6 h-6 text-primary-foreground" />}
        </motion.button>
      </div>

      {/* Capture Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{typeLabels[captureType]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {(captureType === 'task' || captureType === 'appointment') && (
              <Input
                placeholder="Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="text-base"
              />
            )}
            <Textarea
              placeholder={captureType === 'note' ? "What's on your mind?" : "Add details..."}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="min-h-[100px] text-base"
            />
            {(captureType === 'task' || captureType === 'appointment') && (
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-base"
              />
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !(title.trim() || content.trim()) || (captureType === 'appointment' && !date)}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
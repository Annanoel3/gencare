import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function LogEntryDialog({ open, onOpenChange, children_, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'reading',
    family_member_id: '',
    timestamp: nowLocal(),
    title: '',
    minutes: '',
    completed: false,
    stars: '',
    hygiene_habit: 'shower',
    mood: 'happy',
    due_date: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'reading',
        family_member_id: defaultMemberId || f.family_member_id || children_[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, children_]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = {
      entry_type: form.entry_type,
      family_member_id: form.family_member_id,
      timestamp: new Date(form.timestamp).toISOString(),
      notes: form.notes || undefined,
    };
    if (form.entry_type === 'reading') {
      payload.title = form.title || undefined;
      payload.minutes = Number(form.minutes) || undefined;
    } else if (form.entry_type === 'homework') {
      payload.title = form.title || undefined;
      payload.due_date = form.due_date || undefined;
      payload.completed = form.completed;
    } else if (form.entry_type === 'chore') {
      payload.title = form.title || undefined;
      payload.stars = Number(form.stars) || undefined;
      payload.completed = form.completed;
    } else if (form.entry_type === 'hygiene') {
      payload.hygiene_habit = form.hygiene_habit;
    } else if (form.entry_type === 'mood') {
      payload.mood = form.mood;
    } else if (form.entry_type === 'screen_time') {
      payload.minutes = Number(form.minutes) || undefined;
    } else if (form.entry_type === 'activity') {
      payload.title = form.title || undefined;
      payload.minutes = Number(form.minutes) || undefined;
    }
    onCreate(payload);
  };

  const t = form.entry_type;
  const showMinutes = t === 'reading' || t === 'screen_time' || t === 'activity';
  const showTitle = t === 'reading' || t === 'homework' || t === 'chore' || t === 'activity';
  const showCompleted = t === 'homework' || t === 'chore';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl capitalize">Log {t.replace('_', ' ')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Child</Label>
            <Select value={form.family_member_id} onValueChange={v => set('family_member_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select child" /></SelectTrigger>
              <SelectContent>
                {children_.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className="mt-1" />
          </div>

          {showTitle && (
            <div>
              <Label>{t === 'reading' ? 'Book / what they read' : t === 'activity' ? 'Activity' : 'Title'}</Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t === 'reading' ? 'e.g. Charlotte’s Web' : t === 'homework' ? 'e.g. Spelling worksheet' : t === 'chore' ? 'e.g. Feed the dog' : 'e.g. Soccer practice'} className="mt-1" />
            </div>
          )}

          {showMinutes && (
            <div>
              <Label>Minutes</Label>
              <Input type="number" inputMode="numeric" value={form.minutes} onChange={e => set('minutes', e.target.value)} className="mt-1" />
            </div>
          )}

          {t === 'homework' && (
            <div>
              <Label>Due date (optional)</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
            </div>
          )}

          {t === 'chore' && (
            <div>
              <Label>Reward stars</Label>
              <Input type="number" inputMode="numeric" value={form.stars} onChange={e => set('stars', e.target.value)} className="mt-1" />
            </div>
          )}

          {showCompleted && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label className="mb-0">Completed</Label>
              <Switch checked={form.completed} onCheckedChange={v => set('completed', v)} />
            </div>
          )}

          {t === 'hygiene' && (
            <div>
              <Label>Habit</Label>
              <Select value={form.hygiene_habit} onValueChange={v => set('hygiene_habit', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shower">Showered</SelectItem>
                  <SelectItem value="teeth">Brushed teeth</SelectItem>
                  <SelectItem value="bedtime">Went to bed on time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {t === 'mood' && (
            <div>
              <Label>Mood</Label>
              <Select value={form.mood} onValueChange={v => set('mood', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="happy">Happy</SelectItem>
                  <SelectItem value="calm">Calm</SelectItem>
                  <SelectItem value="anxious">Anxious</SelectItem>
                  <SelectItem value="irritable">Irritable</SelectItem>
                  <SelectItem value="upset">Upset</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="mt-1" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.family_member_id || isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
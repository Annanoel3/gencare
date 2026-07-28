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

export default function LogEntryDialog({ open, onOpenChange, preteens, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'schoolwork',
    family_member_id: '',
    timestamp: nowLocal(),
    title: '',
    due_date: '',
    grade: '',
    points: '',
    completed: false,
    puberty_type: 'menstrual',
    cycle_start: '',
    hygiene_habit: 'shower',
    mood: 'happy',
    anxiety_level: '1',
    stress_trigger: '',
    screen_time_min: '',
    allowance_type: 'earn',
    amount: '',
    social_activity: 'playdate',
    social_contact: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'schoolwork',
        family_member_id: defaultMemberId || f.family_member_id || preteens[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, preteens]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = {
      entry_type: form.entry_type,
      family_member_id: form.family_member_id,
      timestamp: new Date(form.timestamp).toISOString(),
      notes: form.notes || undefined,
    };
    if (form.entry_type === 'schoolwork') {
      payload.title = form.title || undefined;
      payload.due_date = form.due_date || undefined;
      payload.grade = form.grade || undefined;
    } else if (form.entry_type === 'chore') {
      payload.title = form.title || undefined;
      payload.points = Number(form.points) || undefined;
      payload.completed = form.completed;
    } else if (form.entry_type === 'puberty') {
      payload.puberty_type = form.puberty_type;
      if (form.puberty_type === 'menstrual') payload.cycle_start = form.cycle_start || undefined;
    } else if (form.entry_type === 'hygiene') {
      payload.hygiene_habit = form.hygiene_habit;
    } else if (form.entry_type === 'mental') {
      payload.mood = form.mood;
      payload.anxiety_level = Number(form.anxiety_level) || undefined;
      payload.stress_trigger = form.stress_trigger || undefined;
    } else if (form.entry_type === 'screen_time') {
      payload.screen_time_min = Number(form.screen_time_min) || undefined;
    } else if (form.entry_type === 'allowance') {
      payload.allowance_type = form.allowance_type;
      payload.amount = Number(form.amount) || undefined;
    } else if (form.entry_type === 'social') {
      payload.social_activity = form.social_activity;
      payload.title = form.title || undefined;
      payload.social_contact = form.social_contact || undefined;
    }
    onCreate(payload);
  };

  const t = form.entry_type;

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
                {preteens.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className="mt-1" />
          </div>

          {(t === 'schoolwork' || t === 'chore' || t === 'social') && (
            <div>
              <Label>{t === 'social' ? 'Activity name' : 'Title'}</Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t === 'schoolwork' ? 'e.g. Math homework' : t === 'chore' ? 'e.g. Take out trash' : 'e.g. Sleepover with Mia'} className="mt-1" />
            </div>
          )}

          {t === 'schoolwork' && (
            <>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Grade (optional)</Label>
                <Input value={form.grade} onChange={e => set('grade', e.target.value)} placeholder="e.g. A, B+, 92" className="mt-1" />
              </div>
            </>
          )}

          {t === 'chore' && (
            <>
              <div>
                <Label>Points / reward value</Label>
                <Input type="number" inputMode="numeric" value={form.points} onChange={e => set('points', e.target.value)} className="mt-1" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                <Label className="mb-0">Completed</Label>
                <Switch checked={form.completed} onCheckedChange={v => set('completed', v)} />
              </div>
            </>
          )}

          {t === 'puberty' && (
            <>
              <div>
                <Label>Type</Label>
                <Select value={form.puberty_type} onValueChange={v => set('puberty_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menstrual">Menstrual</SelectItem>
                    <SelectItem value="acne">Acne flare-up</SelectItem>
                    <SelectItem value="growth">Growth spurt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.puberty_type === 'menstrual' && (
                <div>
                  <Label>Cycle start date</Label>
                  <Input type="date" value={form.cycle_start} onChange={e => set('cycle_start', e.target.value)} className="mt-1" />
                </div>
              )}
            </>
          )}

          {t === 'hygiene' && (
            <div>
              <Label>Habit</Label>
              <Select value={form.hygiene_habit} onValueChange={v => set('hygiene_habit', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shower">Showered</SelectItem>
                  <SelectItem value="teeth">Brushed teeth</SelectItem>
                  <SelectItem value="deodorant">Wore deodorant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {t === 'mental' && (
            <>
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
              <div>
                <Label>Anxiety level (1-5)</Label>
                <Select value={form.anxiety_level} onValueChange={v => set('anxiety_level', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stress trigger</Label>
                <Input value={form.stress_trigger} onChange={e => set('stress_trigger', e.target.value)} placeholder="e.g. school, friends" className="mt-1" />
              </div>
            </>
          )}

          {t === 'screen_time' && (
            <div>
              <Label>Minutes</Label>
              <Input type="number" inputMode="numeric" value={form.screen_time_min} onChange={e => set('screen_time_min', e.target.value)} className="mt-1" />
            </div>
          )}

          {t === 'allowance' && (
            <>
              <div>
                <Label>Type</Label>
                <Select value={form.allowance_type} onValueChange={v => set('allowance_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earn">Earned</SelectItem>
                    <SelectItem value="spend">Spent</SelectItem>
                    <SelectItem value="save">Saved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
              </div>
            </>
          )}

          {t === 'social' && (
            <>
              <div>
                <Label>Activity</Label>
                <Select value={form.social_activity} onValueChange={v => set('social_activity', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="playdate">Playdate</SelectItem>
                    <SelectItem value="sleepover">Sleepover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Friend's parent contact</Label>
                <Input value={form.social_contact} onChange={e => set('social_contact', e.target.value)} placeholder="Name / phone" className="mt-1" />
              </div>
            </>
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
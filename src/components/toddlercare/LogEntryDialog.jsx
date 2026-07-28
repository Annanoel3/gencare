import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function LogEntryDialog({ open, onOpenChange, toddlers, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'mood',
    family_member_id: '',
    timestamp: nowLocal(),
    tantrum_trigger: '',
    tantrum_duration_min: '',
    tantrum_response: '',
    mood: 'happy',
    screen_time_min: '',
    potty_type: 'success',
    milestone_category: 'speech',
    milestone_description: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'mood',
        family_member_id: defaultMemberId || f.family_member_id || toddlers[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, toddlers]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = {
      entry_type: form.entry_type,
      family_member_id: form.family_member_id,
      timestamp: new Date(form.timestamp).toISOString(),
      notes: form.notes || undefined,
    };
    if (form.entry_type === 'tantrum') {
      payload.tantrum_trigger = form.tantrum_trigger || undefined;
      payload.tantrum_duration_min = Number(form.tantrum_duration_min) || undefined;
      payload.tantrum_response = form.tantrum_response || undefined;
    } else if (form.entry_type === 'mood') {
      payload.mood = form.mood;
    } else if (form.entry_type === 'screen_time') {
      payload.screen_time_min = Number(form.screen_time_min) || undefined;
    } else if (form.entry_type === 'potty') {
      payload.potty_type = form.potty_type;
    } else if (form.entry_type === 'milestone') {
      payload.milestone_category = form.milestone_category;
      payload.milestone_description = form.milestone_description || undefined;
    }
    onCreate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl capitalize">Log {form.entry_type.replace('_', ' ')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Child</Label>
            <Select value={form.family_member_id} onValueChange={v => set('family_member_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select child" /></SelectTrigger>
              <SelectContent>
                {toddlers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className="mt-1" />
          </div>

          {form.entry_type === 'tantrum' && (
            <>
              <div>
                <Label>Trigger</Label>
                <Input value={form.tantrum_trigger} onChange={e => set('tantrum_trigger', e.target.value)} placeholder="e.g. toy taken away" className="mt-1" />
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" inputMode="numeric" value={form.tantrum_duration_min} onChange={e => set('tantrum_duration_min', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Response / how handled</Label>
                <Input value={form.tantrum_response} onChange={e => set('tantrum_response', e.target.value)} placeholder="e.g. distraction, calm space" className="mt-1" />
              </div>
            </>
          )}

          {form.entry_type === 'mood' && (
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

          {form.entry_type === 'screen_time' && (
            <div>
              <Label>Minutes</Label>
              <Input type="number" inputMode="numeric" value={form.screen_time_min} onChange={e => set('screen_time_min', e.target.value)} className="mt-1" />
            </div>
          )}

          {form.entry_type === 'potty' && (
            <div>
              <Label>Type</Label>
              <Select value={form.potty_type} onValueChange={v => set('potty_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attempt">Attempt</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="accident">Accident</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {form.entry_type === 'milestone' && (
            <>
              <div>
                <Label>Category</Label>
                <Select value={form.milestone_category} onValueChange={v => set('milestone_category', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speech">Speech</SelectItem>
                    <SelectItem value="motor">Motor skills</SelectItem>
                    <SelectItem value="social">Social skills</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>What happened</Label>
                <Textarea value={form.milestone_description} onChange={e => set('milestone_description', e.target.value)} rows={2} className="mt-1" placeholder="e.g. said a two-word sentence" />
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
import React, { useEffect, useState } from 'react';
import { Trash2, Plus, X, Bell, Users, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFamily, orderMembers } from '@/lib/family';
import { FREQUENCIES, DAY_NAMES, defaultTimes, fmtClock, frequencyLabel, todayStr } from '@/lib/reminders';

function blank() {
  return { medication_name: '', dosage: '', frequency: 'Once daily', family_member_id: '', notes: '', refill_date: '', refill_reminder_days: 3, times: ['08:00'], days_of_week: [], remind: true, is_active: true, once_date: todayStr(), visibility: 'family' };
}

/** Add or edit a reminder, with its times and push settings. */
export default function ReminderDialog({ open, onOpenChange, med, members = [], onSave, onDelete, saving, adherence }) {
  const [form, setForm] = useState(blank());
  const [newTime, setNewTime] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = !!med?.id;
  const { me } = useFamily();
  const people = orderMembers(members, me?.id); // people first, then pets

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setNewTime('');
    if (med) {
      setForm({
        ...blank(), ...med,
        times: Array.isArray(med.times) && med.times.length ? med.times : (med.frequency === 'As needed' ? [] : defaultTimes(med.frequency)),
        days_of_week: Array.isArray(med.days_of_week) ? med.days_of_week : [],
        remind: med.remind !== false,
        refill_reminder_days: typeof med.refill_reminder_days === 'number' ? med.refill_reminder_days : 3,
        refill_date: med.refill_date || '',
        is_active: med.is_active !== false,
        once_date: med.once_date || todayStr(),
        visibility: med.visibility === 'private' ? 'private' : 'family',
      });
    } else setForm(blank());
  }, [open, med]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFrequency = (v) => setForm((f) => ({ ...f, frequency: v, times: editing && f.times.length ? f.times : defaultTimes(v), once_date: f.once_date || todayStr() }));
  const once = form.frequency === 'Once';
  const justMe = form.visibility === 'private';
  const addTime = () => { if (/^\d{2}:\d{2}$/.test(newTime) && !form.times.includes(newTime)) set('times', [...form.times, newTime].sort()); setNewTime(''); };
  const toggleDay = (n) => set('days_of_week', form.days_of_week.includes(n) ? form.days_of_week.filter((d) => d !== n) : [...form.days_of_week, n].sort());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? 'Reminder' : 'Add reminder'}</DialogTitle>
          <DialogDescription className="sr-only">What to remind the family about, and when</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div><Label>What *</Label><Input value={form.medication_name} onChange={(e) => set('medication_name', e.target.value)} placeholder="Feed the dog" className="mt-1" autoFocus={!editing} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Details</Label><Input value={form.dosage} onChange={(e) => set('dosage', e.target.value)} placeholder="1 scoop" className="mt-1" /></div>
            <div>
              <Label>For *</Label>
              <Select value={form.family_member_id} onValueChange={(v) => set('family_member_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Who it's for" /></SelectTrigger>
                <SelectContent>{people.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Who gets reminded</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[['family', 'Everyone', Users], ['private', 'Just me', Lock]].map(([v, label, Icon]) => (
                <button key={v} type="button" onClick={() => set('visibility', v)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium ${form.visibility === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {justMe && <p className="text-xs text-muted-foreground mt-1.5">Only you see it and get the push. The rest of the family won't see it at all.</p>}
          </div>
          <div className={once ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <Label>How often</Label>
              <Select value={form.frequency} onValueChange={setFrequency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{frequencyLabel(f)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {once && <div><Label>Day</Label><Input type="date" value={form.once_date} min={editing ? undefined : todayStr()} onChange={(e) => set('once_date', e.target.value)} className="mt-1" /></div>}
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2"><Bell className="w-4 h-4" /> {justMe ? 'Remind me' : 'Remind the family'}</p>
              <Switch checked={form.remind} onCheckedChange={(v) => set('remind', v)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.times.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
                  {fmtClock(t)}
                  <button type="button" onClick={() => set('times', form.times.filter((x) => x !== t))} aria-label={`Remove ${fmtClock(t)}`}><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
              {form.times.length === 0 && <span className="text-xs text-muted-foreground">No set times</span>}
            </div>
            <div className="flex items-center gap-2">
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="h-9 w-36" />
              <Button type="button" variant="outline" size="sm" onClick={addTime} disabled={!newTime} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add time</Button>
            </div>
            {!once && <div>
              <p className="text-xs text-muted-foreground mb-1">Days (leave all off for every day)</p>
              <div className="flex gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i)} className={`h-8 w-9 rounded-lg text-xs font-medium border ${form.days_of_week.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{d}</button>
                ))}
              </div>
            </div>}
            <p className="text-xs text-muted-foreground">{justMe ? 'You get a push at each time, and a "not done yet?" push 90 minutes later if you haven\'t marked it done.' : 'Everyone in the family gets a push at each time, and a "not done yet?" push 90 minutes later if nobody marks it done.'}</p>
          </div>

          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" rows={2} placeholder="Anything the person doing it should know" /></div>
          {!once && <><div className="grid grid-cols-2 gap-3">
            <div><Label>Runs out on</Label><Input type="date" value={form.refill_date} onChange={(e) => set('refill_date', e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Remind before</Label>
              <Select value={String(form.refill_reminder_days)} onValueChange={(v) => set('refill_reminder_days', Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 14].map((n) => <SelectItem key={n} value={String(n)}>{n} day{n > 1 ? 's' : ''} before</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Optional, for things you have to restock, like dog food or printer ink.</p></>}

          {editing && (
            <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
              <div>
                <p className="text-sm font-medium">{form.is_active ? 'On' : 'Paused'}</p>
                {adherence && adherence.total > 0 && <p className="text-xs text-muted-foreground">Last 14 days: {adherence.taken} done, {adherence.missed} missed{adherence.skipped ? `, ${adherence.skipped} skipped` : ''}</p>}
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={!form.medication_name.trim() || !form.family_member_id || (once && (!form.once_date || !form.times.length)) || saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {med?.medication_name}?</AlertDialogTitle>
            <AlertDialogDescription>Its history goes too. To stop it for a while, switch it off instead and the history stays.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(med)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

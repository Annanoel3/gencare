import React, { useEffect, useState } from 'react';
import { Trash2, Plus, X, Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FREQUENCIES, DAY_NAMES, defaultTimes, fmtClock } from '@/lib/medications';

function blank() {
  return { medication_name: '', dosage: '', frequency: 'Once daily', family_member_id: '', instructions: '', prescribing_doctor: '', pharmacy: '', notes: '', refill_date: '', refill_reminder_days: 3, times: ['08:00'], days_of_week: [], remind: true, is_active: true };
}

/** Add or edit a medication, with its dose times and reminder settings. */
export default function MedicationDialog({ open, onOpenChange, med, members = [], onSave, onDelete, saving, adherence }) {
  const [form, setForm] = useState(blank());
  const [newTime, setNewTime] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = !!med?.id;

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
      });
    } else setForm(blank());
  }, [open, med]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFrequency = (v) => setForm((f) => ({ ...f, frequency: v, times: editing && f.times.length ? f.times : defaultTimes(v) }));
  const addTime = () => { if (/^\d{2}:\d{2}$/.test(newTime) && !form.times.includes(newTime)) set('times', [...form.times, newTime].sort()); setNewTime(''); };
  const toggleDay = (n) => set('days_of_week', form.days_of_week.includes(n) ? form.days_of_week.filter((d) => d !== n) : [...form.days_of_week, n].sort());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? 'Medication' : 'Add medication'}</DialogTitle>
          <DialogDescription className="sr-only">Medication details and reminders</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div><Label>Medication *</Label><Input value={form.medication_name} onChange={(e) => set('medication_name', e.target.value)} className="mt-1" autoFocus={!editing} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Dose</Label><Input value={form.dosage} onChange={(e) => set('dosage', e.target.value)} placeholder="10 mg" className="mt-1" /></div>
            <div>
              <Label>For *</Label>
              <Select value={form.family_member_id} onValueChange={(v) => set('family_member_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Who takes it" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>How often</Label>
            <Select value={form.frequency} onValueChange={setFrequency}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2"><Bell className="w-4 h-4" /> Dose reminders</p>
              <Switch checked={form.remind} onCheckedChange={(v) => set('remind', v)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.times.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
                  {fmtClock(t)}
                  <button type="button" onClick={() => set('times', form.times.filter((x) => x !== t))} aria-label={`Remove ${fmtClock(t)}`}><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
              {form.times.length === 0 && <span className="text-xs text-muted-foreground">No set times (as needed)</span>}
            </div>
            <div className="flex items-center gap-2">
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="h-9 w-36" />
              <Button type="button" variant="outline" size="sm" onClick={addTime} disabled={!newTime} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add time</Button>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Days (leave all off for every day)</p>
              <div className="flex gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i)} className={`h-8 w-9 rounded-lg text-xs font-medium border ${form.days_of_week.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{d}</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Everyone in the family gets a push at each time, and a "missed?" push 90 minutes later if nobody marks it taken.</p>
          </div>

          <div><Label>Instructions</Label><Input value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="With food" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Doctor</Label><Input value={form.prescribing_doctor} onChange={(e) => set('prescribing_doctor', e.target.value)} className="mt-1" /></div>
            <div><Label>Pharmacy</Label><Input value={form.pharmacy} onChange={(e) => set('pharmacy', e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Next refill</Label><Input type="date" value={form.refill_date} onChange={(e) => set('refill_date', e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Remind about refill</Label>
              <Select value={String(form.refill_reminder_days)} onValueChange={(v) => set('refill_reminder_days', Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 14].map((n) => <SelectItem key={n} value={String(n)}>{n} day{n > 1 ? 's' : ''} before</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" rows={2} placeholder="Side effects to watch for, what it's for…" /></div>

          {editing && (
            <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
              <div>
                <p className="text-sm font-medium">{form.is_active ? 'Currently taking' : 'Stopped'}</p>
                {adherence && adherence.total > 0 && <p className="text-xs text-muted-foreground">Last 14 days: {adherence.taken} taken, {adherence.missed} missed{adherence.skipped ? `, ${adherence.skipped} skipped` : ''}</p>}
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={!form.medication_name.trim() || !form.family_member_id || saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {med?.medication_name}?</AlertDialogTitle>
            <AlertDialogDescription>Its dose history goes too. If they just stopped taking it, turn off "Currently taking" instead and the history stays.</AlertDialogDescription>
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

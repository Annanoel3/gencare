import React, { useEffect, useState } from 'react';
import { Trash2, Plus, X, Users, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Choices } from '@/components/shared/MoreOptions';
import NotesField from '@/components/shared/NotesField';
import { useFamily, orderMembers } from '@/lib/family';
import { format, parseISO, addDays } from 'date-fns';
import { DAY_NAMES, defaultTimes, fmtClock, todayStr, nagTimes, nagStart, PRIORITIES, ONE_TIME } from '@/lib/reminders';

const NOBODY = '__nobody__';
// "Remind me at 12" (one push) or "until it's done" (keeps reminding by
// priority): either one, never both (Anna, Oct 29 2026). Every day and Certain
// days are the repeating ones, at the times picked.
const HOW = [['one', 'One time'], ['once', "Until it's done"], ['daily', 'Every day'], ['days', 'Certain days']];

function blank() {
  return { medication_name: '', dosage: '', how: 'once', priority: 'medium', anchor_time: '', family_member_id: NOBODY, notes: '', refill_date: '', refill_reminder_days: 3, times: defaultTimes('Once'), days_of_week: [], remind: true, is_active: true, once_date: todayStr(), visibility: 'family' };
}
const howOf = (m) => (m.frequency === ONE_TIME ? 'one' : m.frequency === 'Once' ? 'once' : Array.isArray(m.days_of_week) && m.days_of_week.length ? 'days' : 'daily');

// How often, from the picks: the times decide how many a day.
function frequencyFor(how, times) {
  if (how === 'once') return 'Once';
  if (how === 'one') return ONE_TIME;
  return ['As needed', 'Once daily', 'Twice daily', 'Three times daily'][times.length] || 'Four times daily';
}

/**
 * Add or edit a reminder: what, how often, what time, who gets it, who it's
 * for and notes. Nothing folded away (Anna, Oct 29 2026); details, a later
 * start day and "runs out on" are gone from the form, and a value an older
 * reminder already has is kept.
 */
export default function ReminderDialog({ open, onOpenChange, med, members = [], onSave, onDelete, saving, adherence }) {
  const [form, setForm] = useState(blank());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = !!med?.id;
  const { me } = useFamily();
  const people = orderMembers(members, me?.id); // people first, then pets

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (med) {
      setForm({
        ...blank(), ...med,
        how: howOf(med),
        family_member_id: med.family_member_id || NOBODY,
        times: Array.isArray(med.times) ? med.times : [],
        days_of_week: Array.isArray(med.days_of_week) ? med.days_of_week : [],
        remind: med.remind !== false,
        refill_reminder_days: typeof med.refill_reminder_days === 'number' ? med.refill_reminder_days : 3,
        refill_date: med.refill_date || '',
        is_active: med.is_active !== false,
        once_date: med.once_date || todayStr(),
        visibility: med.visibility === 'private' ? 'private' : 'family',
        // Older "until it's done" reminders (before priorities) get the one
        // closest to how many times a day they already had.
        priority: med.priority || (med.id && med.frequency === 'Once' ? (med.times?.length > 3 ? 'high' : med.times?.length > 1 ? 'medium' : 'low') : 'medium'),
        anchor_time: med.anchor_time || (Array.isArray(med.times) ? med.times[0] : '') || '',
      });
    } else setForm(blank());
  }, [open, med]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const once = form.how === 'once';
  const justMe = form.visibility === 'private';
  const oneTime = form.how === 'one';
  const setHow = (v) => setForm((f) => ({ ...f, how: v, times: (v === 'one' ? f.times.slice(0, 1) : f.times).length ? (v === 'one' ? f.times.slice(0, 1) : f.times) : defaultTimes(v === 'once' || v === 'one' ? 'Once' : 'Once daily') }));
  const setTime = (i, v) => set('times', form.times.map((t, j) => (j === i ? v : t)));
  const addTime = () => {
    const last = form.times[form.times.length - 1] || '08:00';
    const h = Math.min(Number(last.slice(0, 2)) + 6, 23);
    set('times', [...form.times, `${String(h).padStart(2, '0')}:00`]);
  };
  const toggleDay = (n) => set('days_of_week', form.days_of_week.includes(n) ? form.days_of_week.filter((d) => d !== n) : [...form.days_of_week, n].sort());

  const times = form.times.filter((t) => /^\d{2}:\d{2}$/.test(t));
  const at = times.map(fmtClock).join(' and ');
  const who = justMe ? 'You get' : 'Everyone gets';
  // "Until it's done" starts at the next full hour (or the time it already had).
  const start = nagStart(form.anchor_time || times[0] || defaultTimes('Once')[0], form.once_date || todayStr());
  const anchor = start.anchor;
  const nags = nagTimes(anchor, form.priority);
  const startsLater = !editing && start.day > todayStr();
  const list = (ts) => (ts.length < 3 ? ts.map(fmtClock).join(' and ') : `${ts.slice(0, -1).map(fmtClock).join(', ')} and ${fmtClock(ts[ts.length - 1])}`);
  const dayText = (d) => (d === todayStr() ? 'today' : d === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' : format(parseISO(d), 'EEE, MMM d'));
  const summary = !form.remind ? "No pushes; it shows in To do on its days."
    : oneTime ? `${who} one push at ${times[0] ? fmtClock(times[0]) : '…'} ${dayText(form.once_date || todayStr())}, and that's all.`
    : once ? `${who} a push at ${list(nags)} every day${startsLater ? ', starting tomorrow,' : ''} until ${justMe ? 'you mark' : 'someone marks'} it done.`
    : !times.length ? 'No pushes; it shows in To do on its days.'
    : form.how === 'days' && form.days_of_week.length ? `${who} a push at ${at} on ${form.days_of_week.map((d) => DAY_NAMES[d]).join(', ')}.`
    : `${who} a push at ${at} every day.`;

  const save = () => {
    const sorted = [...new Set(times)].sort();
    onSave({
      ...form,
      times: once ? [anchor] : oneTime ? sorted.slice(0, 1) : sorted,
      anchor_time: once ? anchor : '',
      // Added in the evening: it starts at 8 the next morning.
      ...(once && startsLater ? { once_date: start.day } : {}),
      frequency: frequencyFor(form.how, sorted),
      days_of_week: form.how === 'days' ? form.days_of_week : [],
      family_member_id: form.family_member_id === NOBODY ? '' : form.family_member_id,
      family_member_name: form.family_member_id === NOBODY ? '' : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? 'Reminder' : 'New reminder'}</DialogTitle>
          <DialogDescription className="sr-only">What to remind about, and when</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div><Label>What *</Label><Input value={form.medication_name} onChange={(e) => set('medication_name', e.target.value)} placeholder="Water the plants" className="mt-1" /></div>

          <div>
            <Label>How often</Label>
            <Choices value={form.how} options={HOW} onChange={setHow} className="mt-1.5" />
            {form.how === 'days' && (
              <div className="flex gap-1.5 mt-2">
                {DAY_NAMES.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i)} className={`h-9 flex-1 rounded-lg text-xs font-medium border ${form.days_of_week.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{d}</button>
                ))}
              </div>
            )}
          </div>

          {once ? (
            <div>
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {PRIORITIES.map(([v, label, how]) => (
                  <button key={v} type="button" onClick={() => set('priority', v)}
                    className={`rounded-xl border px-2 py-2 text-center ${form.priority === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className={`block text-[11px] ${form.priority === v ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>{how}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : oneTime ? (
            <div>
              <Label>When</Label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <Input type="date" value={form.once_date || todayStr()} min={editing ? undefined : todayStr()} onChange={(e) => set('once_date', e.target.value)} aria-label="Day" />
                <Input type="time" value={form.times[0] || ''} onChange={(e) => set('times', [e.target.value])} aria-label="Time" />
              </div>
            </div>
          ) : (
          <div>
            <Label>Time</Label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {form.times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} className="h-10 w-32" aria-label={`Time ${i + 1}`} />
                  {form.times.length > 1 && <button type="button" onClick={() => set('times', form.times.filter((_, j) => j !== i))} className="p-1 text-muted-foreground" aria-label="Remove this time"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {form.times.length < 4 && <Button type="button" variant="ghost" size="sm" onClick={addTime} className="gap-1 text-primary"><Plus className="w-3.5 h-3.5" /> Another time</Button>}
            </div>
          </div>
          )}

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
            <p className="text-xs text-muted-foreground mt-1.5">{summary}{justMe ? ' Nobody else sees it.' : ''}</p>
          </div>

          {people.length > 0 && (
            <div>
              <Label>For</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {[{ id: NOBODY, name: 'Nobody in particular' }, ...people].map((m) => (
                  <button key={m.id} type="button" onClick={() => set('family_member_id', m.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${form.family_member_id === m.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`}>
                    {m.id === NOBODY ? m.name : String(m.name || '').split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <NotesField value={form.notes} onChange={(v) => set('notes', v)} placeholder="Anything the person doing it should know" resetKey={`${open}${med?.id || ''}`} />

          {editing && !once && (
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
            <Button onClick={save} disabled={!form.medication_name.trim() || (form.how === 'days' && !form.days_of_week.length) || (oneTime && !times.length) || saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
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

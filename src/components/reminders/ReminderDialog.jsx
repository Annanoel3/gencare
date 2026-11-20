import React, { useEffect, useState } from 'react';
import { Trash2, Plus, X, Users, Lock, CircleStop } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Choices } from '@/components/shared/MoreOptions';
import NotesField from '@/components/shared/NotesField';
import { useFamily, orderMembers } from '@/lib/family';
import { shortNames } from '@/lib/names';
import MissingNote from '@/components/shared/MissingNote';
import { format, parseISO, addDays } from 'date-fns';
import { DAY_NAMES, defaultTimes, fmtClock, todayStr, untilTimes, nagStart, PRIORITIES, ONE_TIME, forIds, stepsOf, andList } from '@/lib/reminders';
import { isPet } from '@/utils/memberColors';
import { GrowingInput } from '@/components/ui/growing-input';
import { DateTimeInput } from '@/components/ui/date-time-input';

const NOBODY = '__nobody__';
// "Remind me at 12" (one push) or "until it's done" (keeps reminding by
// priority): either one, never both (Anna, Oct 29 2026). Every day and Certain
// days are the repeating ones, at the times picked.
const HOW = [['one', 'One time'], ['once', "Until it's done"], ['daily', 'Every day'], ['days', 'Certain days']];

// A new reminder's day and time start empty, showing only placeholder text
// (Anna, Nov 20 2026). "Until it's done" left empty starts today at the next
// full hour (8 the next morning when it's added at night), or 9 AM on a later
// day; the form says when. One time and the repeating kinds ask for a time.
function blank() {
  return { medication_name: '', dosage: '', steps: [], how: 'once', priority: 'medium', anchor_time: '', end_time: '', family_member_ids: [], notes: '', refill_date: '', refill_reminder_days: 3, times: [''], days_of_week: [], remind: true, is_active: true, once_date: '', visibility: 'family' };
}
const autoStart = (day) => (day && day > todayStr() ? { anchor: '09:00', day } : nagStart(defaultTimes('Once')[0], todayStr()));
// An hour after a time (no later than 11:59 PM): an end time's first guess.
const hourAfter = (t) => { const m = Math.min(Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + 60, 23 * 60 + 59); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const okTime = (t) => /^\d{2}:\d{2}$/.test(t || '');
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
  // A repeating reminder asks for its last day, or "Until I stop it" (it said "I don't know" until Nov 14 2026) (saved as
  // no end_date). Stop repeating ends it today.
  const [noEnd, setNoEnd] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [missing, setMissing] = useState(false);
  const [stepText, setStepText] = useState('');
  // "Add end time" (Anna, Nov 19 2026: "pick up dry cleaning from 3-5 p.m.").
  const [showEnd, setShowEnd] = useState(false);
  const editing = !!med?.id;
  const { me } = useFamily();
  // Who a reminder is for is who does it (Anna, Nov 17 2026: "this reminder is
  // for Anna" means Anna needs to do it), so pets aren't on its For list.
  const people = orderMembers(members, me?.id).filter((m) => !isPet(m));
  const forNames = shortNames(people);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setStopped(false);
    setMissing(false);
    setStepText('');
    setShowEnd(!!med?.end_time);
    setNoEnd(!!med?.id && !med.end_date && med.frequency !== 'Once' && med.frequency !== ONE_TIME);
    if (med) {
      const b = blank();
      setForm({
        ...b, ...med,
        how: howOf(med),
        // An older reminder for a pet loses the pet when it's next saved.
        family_member_ids: forIds(med).filter((id) => !isPet(members.find((x) => x.id === id))),
        steps: stepsOf(med),
        times: Array.isArray(med.times) ? med.times : (med.id ? [] : b.times),
        days_of_week: Array.isArray(med.days_of_week) ? med.days_of_week : [],
        remind: med.remind !== false,
        refill_reminder_days: typeof med.refill_reminder_days === 'number' ? med.refill_reminder_days : 3,
        refill_date: med.refill_date || '',
        end_date: med.end_date || '',
        is_active: med.is_active !== false,
        // A new one typed in "Add a reminder…" starts when a blank one would (8 the next morning at night).
        once_date: med.once_date || (med.id ? todayStr() : b.once_date),
        visibility: med.visibility === 'private' ? 'private' : 'family',
        // Older "until it's done" reminders (before priorities) get the one
        // closest to how many times a day they already had.
        priority: med.priority || (med.id && med.frequency === 'Once' ? (med.times?.length > 3 ? 'high' : med.times?.length > 1 ? 'medium' : 'low') : 'medium'),
        anchor_time: med.anchor_time || (med.id && Array.isArray(med.times) ? med.times[0] : '') || b.anchor_time,
        end_time: med.end_time || '',
      });
    } else setForm(blank());
  }, [open, med]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const once = form.how === 'once';
  const justMe = form.visibility === 'private';
  const oneTime = form.how === 'one';
  const repeatsDaily = form.how === 'daily' || form.how === 'days';
  const needsEnd = repeatsDaily && !form.end_date && !noEnd;
  const setHow = (v) => setForm((f) => {
    let ts = (v === 'one' ? f.times.slice(0, 1) : f.times).length ? (v === 'one' ? f.times.slice(0, 1) : f.times) : [''];
    // The two one-off kinds share their day and start time.
    if (v === 'one' && f.how === 'once' && okTime(f.anchor_time)) ts = [f.anchor_time];
    return { ...f, how: v, times: ts, ...(v === 'once' && f.how === 'one' && okTime(f.times[0]) ? { anchor_time: f.times[0] } : {}) };
  });
  // The start time of a one-off to-do ("until it's done" keeps it as when it starts).
  const startOf = (f) => (f.how === 'once' ? f.anchor_time : f.times[0]) || '';
  const setStart = (v) => setForm((f) => {
    const was = startOf(f);
    // A picked end time keeps its length when the start moves.
    let end = f.end_time;
    if (okTime(v) && okTime(was) && okTime(end) && end > was) {
      const m = Math.min(Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) + (Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) - Number(was.slice(0, 2)) * 60 - Number(was.slice(3, 5))), 23 * 60 + 59);
      end = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }
    return { ...f, ...(f.how === 'once' ? { anchor_time: v } : { times: [v] }), end_time: end };
  });
  const toggleEnd = (on) => { setShowEnd(on); if (on && editing && !okTime(form.end_time) && okTime(startOf(form))) set('end_time', hourAfter(startOf(form))); };
  const setTime = (i, v) => set('times', form.times.map((t, j) => (j === i ? v : t)));
  const addTime = () => set('times', [...form.times, '']);
  const toggleDay = (n) => set('days_of_week', form.days_of_week.includes(n) ? form.days_of_week.filter((d) => d !== n) : [...form.days_of_week, n].sort());

  const times = form.times.filter((t) => /^\d{2}:\d{2}$/.test(t));
  const at = times.map(fmtClock).join(' and ');
  // Only the people it's for get the notifications, when they have GenCare
  // themselves; for someone without an account yet (a profile made by hand),
  // everyone does, so it never goes to nobody. Matches cronReminders.
  const doers = (form.family_member_ids || []).map((id) => people.find((p) => p.id === id)).filter((p) => p?.linked_user_id);
  const meOnly = doers.length === 1 && doers[0].linked_user_id === me?.id;
  const who = justMe || meOnly ? 'You get'
    : doers.length ? `${andList(doers.map((p) => forNames.get(p.id) || String(p.name || '').split(' ')[0]))} ${doers.length === 1 ? 'gets' : 'get'}`
    : 'Everyone gets';
  // "Until it's done" starts at the day and time on the form; its other
  // reminders come from its priority (inside the end time, when there is one).
  const end = (once || oneTime) && showEnd && okTime(form.end_time) && okTime(startOf(form)) && form.end_time > startOf(form) ? form.end_time : '';
  const start = okTime(form.anchor_time) ? { anchor: form.anchor_time, day: form.once_date || todayStr() } : autoStart(form.once_date);
  const anchor = start.anchor;
  const nags = untilTimes(anchor, form.priority, end);
  const startsLater = start.day > todayStr();
  const list = (ts) => (ts.length < 3 ? ts.map(fmtClock).join(' and ') : `${ts.slice(0, -1).map(fmtClock).join(', ')} and ${fmtClock(ts[ts.length - 1])}`);
  const dayText = (d) => (!d ? '…' : d === todayStr() ? 'today' : d === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' : format(parseISO(d), 'EEE, MMM d'));
  const onDay = (d) => { const t = dayText(d); return t === 'today' || t === 'tomorrow' ? t : `on ${t}`; };
  const untilText = form.end_date ? `, through ${dayText(form.end_date)}` : '';
  const marks = justMe || meOnly ? 'you mark' : doers.length === 1 ? 'they mark' : 'someone marks';
  // Right under Priority: exactly when its reminders come (Anna, Nov 19 2026:
  // "Priority and how often seem too similar"; its buttons said "once a day",
  // "3 times a day", "every 2 hours", like more How often choices).
  const nagLine = !form.remind ? 'No notifications; it shows in Reminders until it\'s done.'
    : end ? `${nags.length === 1 ? 'A reminder' : 'Reminders'} at ${list(nags)} ${onDay(start.day)}. Not done by ${fmtClock(end)}? ${nags.length === 1 ? 'The same time' : 'The same times'} the next day, until ${marks} it done.`
    : `${nags.length === 1 ? 'A reminder' : 'Reminders'} at ${list(nags)} every day${startsLater ? `, starting ${dayText(start.day)},` : ''} until ${marks} it done.`;
  const summary = !form.remind ? "No notifications; it shows in Reminders on its days."
    : oneTime ? `${who} one notification at ${times[0] ? fmtClock(times[0]) : '…'} ${dayText(form.once_date)}, and that's all.`
    : once ? `${who} these reminders.`
    : !times.length ? 'No notifications; it shows in Reminders on its days.'
    : form.how === 'days' && form.days_of_week.length ? `${who} a notification at ${at} on ${form.days_of_week.map((d) => DAY_NAMES[d]).join(', ')}${untilText}.`
    : `${who} a notification at ${at} every day${untilText}.`;

  const stopRepeating = () => { set('end_date', todayStr()); setNoEnd(false); setStopped(true); };
  const ordered = (ids = []) => people.map((m) => m.id).filter((id) => ids.includes(id)).concat(ids.filter((id) => !people.some((m) => m.id === id)));
  // What Save/Add still needs, in words, shown once it's tapped (it used to just sit grey).
  const whyMissing = !form.medication_name.trim() ? 'Write what it is first (under What).'
    : form.how === 'days' && !form.days_of_week.length ? 'Pick at least one day.'
    : oneTime && !form.once_date ? 'Pick a day.'
    : oneTime && !times.length ? 'Pick a time.'
    : repeatsDaily && form.remind && !times.length ? 'Pick a time.'
    : (once || oneTime) && showEnd && !okTime(startOf(form)) ? 'Pick a start time, or untick Add end time.'
    : (once || oneTime) && showEnd && !(okTime(form.end_time) && form.end_time > startOf(form)) ? 'Pick an end time after the start time, or untick Add end time.'
    : needsEnd ? "Pick the last day it reminds, or tick Until I stop it."
    : '';
  const steps = Array.isArray(form.steps) ? form.steps : [];
  const addStep = () => { const t = stepText.trim(); if (!t) return; if (!steps.includes(t)) set('steps', [...steps, t]); setStepText(''); };
  const save = () => {
    if (whyMissing) { setMissing(true); return; }
    const sorted = [...new Set(times)].sort();
    onSave({
      ...form,
      // A step typed but not added yet still counts.
      steps: stepsOf({ steps: [...steps, stepText] }),
      times: once ? [anchor] : oneTime ? sorted.slice(0, 1) : sorted,
      anchor_time: once ? anchor : '',
      ...(once ? { once_date: start.day } : {}),
      // The day and time on the form, as they are (lib/reminders cleanMed).
      picked_time: once,
      end_time: end,
      frequency: frequencyFor(form.how, sorted),
      days_of_week: form.how === 'days' ? form.days_of_week : [],
      // In the family's order (people, then pets), not the order they were tapped.
      family_member_ids: ordered(form.family_member_ids),
      family_member_id: ordered(form.family_member_ids)[0] || '',
      family_member_name: undefined,
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
          <div><Label>What *</Label><GrowingInput value={form.medication_name} onChange={(e) => set('medication_name', e.target.value)} placeholder="Water the plants" className="mt-1" /></div>

          {/* Steps, like a checklist (Anna, Nov 14 2026): anyone can tick them, and the last one marks it done. */}
          <div>
            <Label>Steps <span className="font-normal text-muted-foreground">(optional)</span></Label>
            {steps.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {steps.map((st, i) => (
                  <li key={`${st}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card pl-3 pr-1 py-1">
                    <span className="w-5 h-5 rounded-md border-2 border-primary/40 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-sm break-words">{st}</span>
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground flex-shrink-0" onClick={() => set('steps', steps.filter((_, j) => j !== i))} aria-label={`Remove ${st}`}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-start gap-2 mt-1.5 big-stack">
              <GrowingInput value={stepText} onChange={(e) => setStepText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
                placeholder="Add a step…" enterKeyHint="enter" aria-label="Add a step" />
              <Button type="button" variant="outline" onClick={addStep} className="flex-shrink-0 gap-1"><Plus className="w-4 h-4" /> Add step</Button>
            </div>
            {steps.length === 0 && <p className="text-xs text-muted-foreground mt-1">Like a checklist. Anyone can tick them off, and ticking the last one marks it done.</p>}
          </div>

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

          {(once || oneTime) && (
            <div>
              <Label>When</Label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <DateTimeInput type="date" value={form.once_date} placeholder="Pick a day" min={editing ? undefined : todayStr()} onChange={(e) => set('once_date', e.target.value)} aria-label="Day" />
                <DateTimeInput type="time" value={startOf(form)} placeholder="Pick a time" onChange={(e) => setStart(e.target.value)} aria-label={showEnd ? 'Starts' : 'Time'} />
              </div>
              <label className="flex items-center gap-2 text-sm mt-2 w-fit">
                <Checkbox checked={showEnd} onCheckedChange={(v) => toggleEnd(!!v)} /> Add end time
              </label>
              {showEnd && (
                <div className="flex items-center gap-3 mt-2">
                  <Label htmlFor="todo-end" className="text-sm font-normal text-muted-foreground w-10">Ends</Label>
                  <DateTimeInput id="todo-end" type="time" value={form.end_time} placeholder="Pick a time" onChange={(e) => set('end_time', e.target.value)} wrapClassName="flex-1" aria-label="Ends" />
                </div>
              )}
              {once && !showEnd && <p className="text-xs text-muted-foreground mt-1.5">It starts reminding {onDay(start.day)} at {fmtClock(anchor)}.</p>}
            </div>
          )}

          {once ? (
            <div>
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {PRIORITIES.map(([v, label]) => (
                  <button key={v} type="button" onClick={() => set('priority', v)} aria-pressed={form.priority === v}
                    className={`rounded-xl border px-2 py-2.5 text-center text-sm font-semibold ${form.priority === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{nagLine}</p>
            </div>
          ) : oneTime ? null : (
          <>
          <div>
            <Label>Time</Label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {form.times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <DateTimeInput type="time" value={t} placeholder="Pick a time" onChange={(e) => setTime(i, e.target.value)} className="h-10" wrapClassName="w-36" aria-label={`Time ${i + 1}`} />
                  {form.times.length > 1 && <button type="button" onClick={() => set('times', form.times.filter((_, j) => j !== i))} className="p-1 text-muted-foreground" aria-label="Remove this time"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {form.times.length < 4 && <Button type="button" variant="ghost" size="sm" onClick={addTime} className="gap-1 text-primary"><Plus className="w-3.5 h-3.5" /> Another time</Button>}
            </div>
          </div>
          <div className={`rounded-xl border p-3 ${needsEnd ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/40'}`}>
            <Label className="text-xs">Last day it reminds</Label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1">
              <DateTimeInput type="date" value={form.end_date} placeholder="Pick a day" min={editing ? undefined : todayStr()} disabled={noEnd}
                onChange={(e) => { set('end_date', e.target.value); if (e.target.value) setNoEnd(false); }} className="h-9" wrapClassName="flex-1 min-w-[9.5rem]" aria-label="Last day it reminds" />
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Checkbox checked={noEnd} onCheckedChange={(v) => { setNoEnd(!!v); if (v) set('end_date', ''); }} /> Until I stop it
              </label>
            </div>
            {needsEnd && <p className="text-xs text-muted-foreground mt-1.5">Pick its last day, or tick Until I stop it.</p>}
            {editing && !stopped && !(med?.end_date && med.end_date < todayStr()) && (
              <Button type="button" variant="outline" size="sm" onClick={stopRepeating} className="mt-2.5 gap-1.5"><CircleStop className="w-4 h-4" /> Stop repeating</Button>
            )}
            {stopped && <p className="text-xs text-primary mt-2">It won't remind after today. Tap Save.</p>}
          </div>
          </>
          )}

          <div>
            <Label>Who gets reminded</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[['family', 'Everyone', Users], ['private', 'Only me', Lock]].map(([v, label, Icon]) => (
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
              {/* Tap as many people as it's for (the ones doing it); Whole family (it was "Nobody in particular", the
                  to-do form's word for the same thing) clears them. */}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {[{ id: NOBODY, name: 'Whole family' }, ...people].map((m) => {
                  const ids = form.family_member_ids || [];
                  const on = m.id === NOBODY ? !ids.length : ids.includes(m.id);
                  const tap = () => set('family_member_ids', m.id === NOBODY ? [] : on ? ids.filter((x) => x !== m.id) : [...ids, m.id]);
                  return (
                  <button key={m.id} type="button" onClick={tap} aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'}`}>
                    {m.id === NOBODY ? m.name : forNames.get(m.id) || String(m.name || '').split(' ')[0]}
                  </button>
                ); })}
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

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
            </div>
          </div>
          <MissingNote text={missing ? whyMissing : ''} className="-mt-2" />
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

import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Users, Lock, Mic, Check, Sparkles, Loader2 } from 'lucide-react';
import { useFamily } from '@/lib/family';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isRecordable, categoryOf, CATEGORIES } from './EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import { EVENT_REPEATS, repeatLabel, parseRRule } from '@/lib/occurrences';

export { CATEGORIES };
const REMINDERS = [
  { v: -1, label: 'No reminder' },
  { v: 0, label: 'At the time' },
  { v: 15, label: '15 minutes before' },
  { v: 30, label: '30 minutes before' },
  { v: 60, label: '1 hour before' },
  { v: 120, label: '2 hours before' },
  { v: 1440, label: 'The day before' },
];

const NONE = '__none__';

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
      {on && <Check className="w-3 h-3" />}{children}
    </button>
  );
}

// A new event's sharing starts at the person's choice ("Who sees the events
// you add"); with "GenCare decides" it shows as its own chip until saved.
function blank(date, sharingDefault) {
  return {
    title: '', date: format(date || new Date(), 'yyyy-MM-dd'), time: '', end_time: '', all_day: false,
    category: 'Appointment', family_member_id: NONE, location: '', doctor_name: '', notes: '',
    reminder_minutes: 60, visibility: sharingDefault === 'auto' ? 'auto' : sharingDefault === 'private' ? 'private' : 'family',
    shared_with: [], end_date: '', recurrence: '', until: '',
  };
}

const AUTOSAVE_MS = 700;
// What autosave compares (the timestamp changes on every build).
const saveKey = (d) => JSON.stringify({ ...d, last_changed_at: undefined });

// One dialog for adding and editing. `appt` null = new event. Editing saves
// on its own (onAutoSave) a moment after each change; a new event is added
// with the button (onSave), since half-typed events shouldn't reach anyone.
export default function EventDialog({ open, onClose, appt, defaultDate, members, onSave, onAutoSave, onDelete, saving, sharingDefault = '' }) {
  const [form, setForm] = useState(blank(defaultDate, sharingDefault));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which of sharing / who it's for / category the person picked themselves.
  const touched = useRef(new Set());
  const lastSaved = useRef('');
  const timer = useRef(null);
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'saved' | 'error' | 'needs_title'
  const canRecord = usePluginPresent('RecorderBridge');
  const { me, members: accounts } = useFamily();
  const others = (accounts || []).filter((u) => u.id !== me?.id);
  const editing = !!appt?.id;
  const fromPhone = appt?.source === 'phone';

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    touched.current = new Set();
    setSaveState('');
    clearTimeout(timer.current);
    if (appt) {
      const loaded = {
        ...blank(defaultDate, sharingDefault),
        ...appt,
        category: categoryOf(appt) || 'Other',
        family_member_id: appt.family_member_id || NONE,
        reminder_minutes: typeof appt.reminder_minutes === 'number' ? appt.reminder_minutes : 60,
        visibility: appt.visibility || 'family',
        shared_with: Array.isArray(appt.shared_with) ? appt.shared_with : [],
        time: appt.time || '',
        end_time: appt.end_time || '',
        end_date: appt.end_date || '',
        recurrence: baseRule(appt.recurrence),
        until: untilOf(appt.recurrence),
      };
      setForm(loaded);
      lastSaved.current = saveKey(buildData(loaded));
    } else {
      setForm(blank(defaultDate, sharingDefault));
    }
  }, [open, appt, defaultDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pick = (field, fn) => { touched.current.add(field); fn(); };

  // The fields to save, from the form.
  function buildData(f) {
    const member = members.find((m) => m.id === f.family_member_id);
    const data = {
      title: f.title.trim(),
      date: f.date,
      time: f.all_day ? '' : f.time,
      end_time: f.all_day ? '' : f.end_time,
      all_day: !!f.all_day,
      category: f.category,
      family_member_id: member ? member.id : '',
      family_member_name: member ? member.name : '',
      location: f.location || '',
      doctor_name: f.doctor_name || '',
      notes: f.notes || '',
      reminder_minutes: Number(f.reminder_minutes),
      end_date: f.end_date && f.end_date > f.date ? f.end_date : '',
      recurrence: withUntil(f.recurrence, f.until),
      // "GenCare decides" is saved as Only me until it's decided.
      visibility: f.visibility === 'private' || f.visibility === 'auto' ? 'private' : f.visibility === 'some' ? 'some' : 'family',
      shared_with: f.visibility === 'some' ? (f.shared_with || []).filter((id) => others.some((u) => u.id === id)) : [],
      last_changed_at: new Date().toISOString(),
    };
    // What GenCare filled in stays marked as its own until the person changes it.
    if (appt?.id) {
      const legacyPrivateImport = !Array.isArray(appt.auto_set) && appt.source === 'phone' && (appt.visibility || 'private') === 'private';
      const base = Array.isArray(appt.auto_set) ? appt.auto_set : legacyPrivateImport ? ['visibility'] : null;
      if (base) data.auto_set = base.filter((k) => !touched.current.has(k));
      else if (touched.current.size) data.auto_set = [];
    }
    return data;
  }

  const submit = () => {
    const data = buildData(form);
    // What the person left for GenCare to fill in after it's added.
    const left = {
      visibility: !touched.current.has('visibility') && form.visibility === 'auto',
      member: !touched.current.has('member') && form.family_member_id === NONE,
      category: !touched.current.has('category'),
    };
    data.auto_set = [left.visibility && 'visibility', left.category && 'category'].filter(Boolean);
    onSave(data, left);
  };

  // Editing: save a moment after each change.
  const saveNow = () => {
    clearTimeout(timer.current);
    if (!appt?.id || !onAutoSave) return Promise.resolve();
    if (!form.title.trim() || !form.date) { setSaveState('needs_title'); return Promise.resolve(); }
    const data = buildData(form);
    const key = saveKey(data);
    if (key === lastSaved.current) return Promise.resolve();
    lastSaved.current = key;
    setSaveState('saving');
    return Promise.resolve(onAutoSave(data))
      .then(() => setSaveState('saved'))
      .catch(() => { lastSaved.current = ''; setSaveState('error'); });
  };
  useEffect(() => {
    if (!open || !appt?.id) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(timer.current);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing saves anything still waiting.
  const close = async () => { if (appt?.id) await saveNow(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading text-xl">{editing ? 'Edit Event' : 'New Event'}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {fromPhone && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
              This came from {appt.created_by_name ? `${appt.created_by_name}'s` : 'a'} phone calendar. Who it's for, the category and sharing are kept here; the title and time follow the phone.
            </p>
          )}
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set('title', e.target.value)} className="mt-1" autoFocus={!editing} /></div>

          {/* Who this event is for: the one choice that decides who sees it,
              who gets the push, and whose phone calendar it lands on. */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Share with</p>
            <div className="flex flex-wrap gap-2">
              {!editing && sharingDefault === 'auto' && (
                <Chip on={form.visibility === 'auto'} onClick={() => set('visibility', 'auto')}><Sparkles className="w-3 h-3" /> GenCare decides</Chip>
              )}
              <Chip on={form.visibility === 'family'} onClick={() => pick('visibility', () => set('visibility', 'family'))}>Whole family</Chip>
              <Chip on={form.visibility === 'private'} onClick={() => pick('visibility', () => set('visibility', 'private'))}><Lock className="w-3 h-3" /> Only me</Chip>
              {others.map((u) => {
                const on = form.visibility === 'some' && (form.shared_with || []).includes(u.id);
                return (
                  <Chip key={u.id} on={on} onClick={() => {
                    touched.current.add('visibility');
                    const cur = form.visibility === 'some' ? (form.shared_with || []) : [];
                    const next = cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id];
                    setForm((f) => ({ ...f, visibility: next.length ? 'some' : 'private', shared_with: next }));
                  }}>{(u.full_name || u.email || '?').split(' ')[0]}</Chip>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.visibility === 'auto' ? 'When you add it, GenCare shares appointments and family plans with everyone and keeps anything personal to you.'
                : form.visibility === 'private' ? 'Nobody else sees it.'
                : form.visibility === 'some' ? 'Only the people ticked see it, get told about it, and can have it on their phone calendar.'
                : 'Everyone in the family sees it, gets told about it, and can have it on their phone calendar.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className="mt-1" /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.all_day} onCheckedChange={(v) => set('all_day', v)} /> All day</label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Last day <span className="text-muted-foreground font-normal">(multi-day)</span></Label><Input type="date" value={form.end_date} min={form.date} onChange={(e) => set('end_date', e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Repeats</Label>
              {fromPhone ? (
                <p className="mt-2 text-sm text-muted-foreground">{repeatLabel(appt.recurrence) || 'No'}{appt.recurrence ? ' (set on the phone)' : ''}</p>
              ) : (
                <Select value={form.recurrence} onValueChange={(v) => set('recurrence', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Does not repeat" /></SelectTrigger>
                  <SelectContent>{EVENT_REPEATS.map((r) => <SelectItem key={r.value || 'none'} value={r.value || '__none__'}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </div>
          {!fromPhone && form.recurrence && form.recurrence !== '__none__' && (
            <div><Label>Until <span className="text-muted-foreground font-normal">(optional)</span></Label><Input type="date" value={form.until} min={form.date} onChange={(e) => set('until', e.target.value)} className="mt-1" /></div>
          )}
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Starts</Label><Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className="mt-1" /></div>
              <div><Label>Ends</Label><Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className="mt-1" /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => pick('category', () => set('category', v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Family Member</Label>
              <Select value={form.family_member_id} onValueChange={(v) => pick('member', () => set('family_member_id', v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody in particular</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!form.all_day && (
            <div>
              <Label>Reminder</Label>
              <Select value={String(form.reminder_minutes)} onValueChange={(v) => set('reminder_minutes', Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{REMINDERS.map((r) => <SelectItem key={r.v} value={String(r.v)}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => set('location', e.target.value)} className="mt-1" /></div>
          <div><Label>With</Label><Input value={form.doctor_name} onChange={(e) => set('doctor_name', e.target.value)} placeholder="Who it's with (optional)" className="mt-1" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" /></div>

          {editing && canRecord && isRecordable(form) && (
            <Link to={`/notes?appointment=${appt.id}`} className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-3 text-sm font-medium text-red-700 dark:text-red-200">
              <Mic className="w-4 h-4" /> {appt.notes_record_id ? 'Open the notes from this visit' : 'Record notes at this visit'}
            </Link>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {editing ? (
              confirmDelete ? (
                <Button variant="destructive" size="sm" onClick={() => { clearTimeout(timer.current); onDelete(appt); }} disabled={saving}>Yes, delete it</Button>
              ) : (
                <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>
              )
            ) : <span />}
            {editing ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>
                    : saveState === 'saved' ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                    : saveState === 'error' ? <span className="text-destructive">Not saved, check your connection</span>
                    : saveState === 'needs_title' ? <span className="text-destructive">Add a title to save</span>
                    : 'Changes save on their own'}
                </span>
                <Button onClick={close}>Done</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={submit} disabled={!form.title.trim() || !form.date || saving}>
                  {saving ? 'Saving...' : 'Create Event'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The repeat choice without its UNTIL, so the select can show it.
function baseRule(rule) {
  if (!rule) return '';
  const r = parseRRule(rule);
  if (!r) return '';
  const known = EVENT_REPEATS.find((o) => o.value && parseRRule(o.value) && sameRule(parseRRule(o.value), r));
  return known ? known.value : String(rule).replace(/;UNTIL=[^;]*/i, '');
}
function sameRule(a, b) {
  return a.freq === b.freq && a.interval === b.interval && [...a.byday].sort().join() === [...b.byday].sort().join();
}
function untilOf(rule) {
  const r = parseRRule(rule);
  return r?.until ? format(r.until, 'yyyy-MM-dd') : '';
}
function withUntil(rule, until) {
  if (!rule || rule === '__none__') return '';
  const base = String(rule).replace(/;UNTIL=[^;]*/i, '');
  return until ? `${base};UNTIL=${until.replace(/-/g, '')}` : base;
}

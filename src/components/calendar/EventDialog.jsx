import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Users, Lock, Mic, Check, Sparkles, Loader2, Repeat } from 'lucide-react';
import { useFamily, orderMembers } from '@/lib/family';
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
import AddressField from '@/components/shared/AddressField';

export { CATEGORIES };

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
    title: '', date: format(date || new Date(), 'yyyy-MM-dd'), time: nextHour(), end_time: '', all_day: false,
    category: 'Appointment', family_member_id: NONE, location: '', doctor_name: '', notes: '',
    reminder_minutes: 60, visibility: sharingDefault === 'auto' ? 'auto' : sharingDefault === 'private' ? 'private' : 'family',
    shared_with: [], end_date: '', recurrence: '', until: '',
  };
}

// A new event starts at the next full hour instead of an empty time box
// (Anna, Oct 29 2026); change it or switch on All day.
function nextHour() {
  const h = (new Date().getHours() + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
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
  const [showRepeat, setShowRepeat] = useState(false);
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
    setShowRepeat(false);
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
    // Keyed on the event's id and the day, not the objects: the page behind
    // re-renders after every autosave, and resetting the form then wiped what
    // was being typed (Anna, Oct 29 2026: the place field cleared itself).
  }, [open, appt?.id, defaultDate ? format(defaultDate, 'yyyy-MM-dd') : '']); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pick = (field, fn) => { touched.current.add(field); fn(); };
  const repeating = !!form.recurrence && form.recurrence !== '__none__';

  // The fields to save, from the form.
  function buildData(f) {
    const member = members.find((m) => m.id === f.family_member_id);
    const data = {
      title: f.title.trim(),
      date: f.date,
      time: f.all_day ? '' : f.time,
      // No end-time field any more (Anna: nobody uses it); one from the phone
      // stays while it's still after the start.
      end_time: f.all_day || !f.end_time || (f.time && f.end_time <= f.time) ? '' : f.end_time,
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
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading text-xl">{editing ? 'Event' : 'New event'}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {fromPhone && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
              From {appt.created_by_name ? `${appt.created_by_name.split(' ')[0]}'s` : 'a'} phone calendar. Changes made on the phone show up here; who it's for, who sees it, and a place or notes added here stay.
            </p>
          )}
          <div><Label>What *</Label><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Mom's speech therapy" className="mt-1" /></div>

          <div>
            <Label>When</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} aria-label="Day" />
              {!form.all_day ? <Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} aria-label="Time" /> : <span />}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2">
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.all_day} onCheckedChange={(v) => set('all_day', v)} /> All day</label>
              {fromPhone ? (appt.recurrence ? <span className="text-xs text-muted-foreground flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> {repeatLabel(appt.recurrence)}</span> : null)
                : repeating || showRepeat ? (
                  <div className="flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select value={form.recurrence || '__none__'} onValueChange={(v) => { set('recurrence', v === '__none__' ? '' : v); if (v === '__none__') setShowRepeat(false); }}>
                      <SelectTrigger className="h-8 text-xs w-auto gap-1 border-none shadow-none px-1"><SelectValue placeholder="Doesn't repeat" /></SelectTrigger>
                      <SelectContent>{EVENT_REPEATS.map((r) => <SelectItem key={r.value || 'none'} value={r.value || '__none__'}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : <button type="button" onClick={() => setShowRepeat(true)} className="text-xs text-primary flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> Repeat</button>}
            </div>
          </div>

          <div>
            <Label>Who</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {orderMembers(members, me?.id).map((m) => (
                <Chip key={m.id} on={form.family_member_id === m.id} onClick={() => pick('member', () => set('family_member_id', form.family_member_id === m.id ? NONE : m.id))}>{(m.name || '').split(' ')[0]}</Chip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 mb-1.5 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Who sees it</p>
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
                  }}>{(u.display_name || u.full_name || u.email || '?').split(' ')[0]}</Chip>
                );
              })}
            </div>
          </div>

          <div><Label>Where</Label><AddressField value={form.location} onChange={(v) => set('location', v)} className="mt-1" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" rows={form.notes && form.notes.length > 120 ? 5 : 2} /></div>

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
                  {saving ? 'Saving…' : 'Add'}
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

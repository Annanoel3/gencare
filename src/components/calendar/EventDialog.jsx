import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Users, Lock, Mic, Check } from 'lucide-react';
import { useFamily } from '@/lib/family';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isRecordable } from './EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import { EVENT_REPEATS, repeatLabel, parseRRule } from '@/lib/occurrences';

export const CATEGORIES = ['Doctor', 'Therapy', 'School', 'Sports', 'Social', 'Other'];
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

function blank(date) {
  return {
    title: '', date: format(date || new Date(), 'yyyy-MM-dd'), time: '', end_time: '', all_day: false,
    category: 'Doctor', family_member_id: NONE, location: '', doctor_name: '', notes: '',
    reminder_minutes: 60, visibility: 'family', shared_with: [], end_date: '', recurrence: '', until: '',
  };
}

// One dialog for adding and editing. `appt` null = new event.
export default function EventDialog({ open, onClose, appt, defaultDate, members, onSave, onDelete, saving }) {
  const [form, setForm] = useState(blank(defaultDate));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canRecord = usePluginPresent('RecorderBridge');
  const { me, members: accounts } = useFamily();
  const others = (accounts || []).filter((u) => u.id !== me?.id);
  const editing = !!appt?.id;
  const fromPhone = appt?.source === 'phone';

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (appt) {
      setForm({
        ...blank(defaultDate),
        ...appt,
        family_member_id: appt.family_member_id || NONE,
        reminder_minutes: typeof appt.reminder_minutes === 'number' ? appt.reminder_minutes : 60,
        visibility: appt.visibility || 'family',
        shared_with: Array.isArray(appt.shared_with) ? appt.shared_with : [],
        time: appt.time || '',
        end_time: appt.end_time || '',
        end_date: appt.end_date || '',
        recurrence: baseRule(appt.recurrence),
        until: untilOf(appt.recurrence),
      });
    } else {
      setForm(blank(defaultDate));
    }
  }, [open, appt, defaultDate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const member = members.find((m) => m.id === form.family_member_id);
    const data = {
      title: form.title.trim(),
      date: form.date,
      time: form.all_day ? '' : form.time,
      end_time: form.all_day ? '' : form.end_time,
      all_day: !!form.all_day,
      category: form.category,
      family_member_id: member ? member.id : '',
      family_member_name: member ? member.name : '',
      location: form.location || '',
      doctor_name: form.doctor_name || '',
      notes: form.notes || '',
      reminder_minutes: Number(form.reminder_minutes),
      end_date: form.end_date && form.end_date > form.date ? form.end_date : '',
      recurrence: withUntil(form.recurrence, form.until),
      visibility: form.visibility === 'private' ? 'private' : form.visibility === 'some' ? 'some' : 'family',
      shared_with: form.visibility === 'some' ? (form.shared_with || []).filter((id) => others.some((u) => u.id === id)) : [],
      last_changed_at: new Date().toISOString(),
    };
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
              <Chip on={form.visibility === 'family'} onClick={() => set('visibility', 'family')}>Whole family</Chip>
              <Chip on={form.visibility === 'private'} onClick={() => set('visibility', 'private')}><Lock className="w-3 h-3" /> Only me</Chip>
              {others.map((u) => {
                const on = form.visibility === 'some' && (form.shared_with || []).includes(u.id);
                return (
                  <Chip key={u.id} on={on} onClick={() => {
                    const cur = form.visibility === 'some' ? (form.shared_with || []) : [];
                    const next = cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id];
                    setForm((f) => ({ ...f, visibility: next.length ? 'some' : 'private', shared_with: next }));
                  }}>{(u.full_name || u.email || '?').split(' ')[0]}</Chip>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.visibility === 'private' ? 'Nobody else sees it.'
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
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Family Member</Label>
              <Select value={form.family_member_id} onValueChange={(v) => set('family_member_id', v)}>
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
          {(form.category === 'Doctor' || form.category === 'Therapy') && (
            <div><Label>With (doctor / provider)</Label><Input value={form.doctor_name} onChange={(e) => set('doctor_name', e.target.value)} className="mt-1" /></div>
          )}
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" /></div>

          {editing && canRecord && isRecordable(form) && (
            <Link to={`/notes?appointment=${appt.id}`} className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-3 text-sm font-medium text-red-700 dark:text-red-200">
              <Mic className="w-4 h-4" /> {appt.notes_record_id ? 'Open the notes from this visit' : 'Record notes at this visit'}
            </Link>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {editing ? (
              confirmDelete ? (
                <Button variant="destructive" size="sm" onClick={() => onDelete(appt)} disabled={saving}>Yes, delete it</Button>
              ) : (
                <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>
              )
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={!form.title.trim() || !form.date || saving}>
                {saving ? 'Saving...' : editing ? 'Save' : 'Create Event'}
              </Button>
            </div>
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

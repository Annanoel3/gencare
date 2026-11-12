import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid } from 'date-fns';
import { Camera, ImagePlus, Loader2, Repeat, AlertCircle, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddressField from '@/components/shared/AddressField';
import { toast } from '@/components/ui/use-toast';
import { useFamily, orderMembers, withFamily } from '@/lib/family';
import { listEvents, sortNewEvent, startingVisibility } from '@/lib/events';
import { exportSoon } from '@/lib/calendarSync';
import { track } from '@/lib/activity';
import { expandAppointments } from '@/lib/occurrences';
import { matchCalendar, notOnSchedule } from '@/lib/photoDupes';
import { newImportId, takeOff, putBack } from '@/lib/photoBatch';

// Add to the calendar from a photo (Anna, Nov 9 2026): an appointment card, a
// school calendar, a flyer, a screenshot. GenCare reads the dates
// (functions/photoEvents), the person checks them, and only then are they
// added. "Where" and "For" at the top go on every event (Anna: "all
// appointments are at the same location"). The photo isn't kept.
// A new photo of a schedule that changed (Anna, Nov 12 2026) also lists what's
// on the calendar at that place, in the photo's dates, that the new schedule
// doesn't have, to take off in the same step (lib/photoDupes notOnSchedule).
// Events from one photo share an import_id, so they can all come off later
// too (PhotoBatchRow), and Undo right after puts everything back.

const KEEP = '__keep__';
const NOBODY = '__nobody__';

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => resolve({ img, url });
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
  img.src = url;
});

// A photo as JPEG pieces small enough to send but sharp enough to read. A long
// screenshot (a scrolled page) is cut into a few pieces top to bottom, since
// shrinking it whole would make the words too small.
async function piecesOf(file) {
  const { img, url } = await loadImage(file);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const tall = h / w > 2;
    // A tall page keeps a readable width and is cut into pieces; anything
    // else just fits within 2048 (what the reader looks at anyway).
    const scale = tall ? Math.min(1, 1200 / w) : Math.min(1, 2048 / Math.max(w, h));
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    const pieceH = tall ? Math.round(sw * 1.6) : sh;
    const overlap = pieceH < sh ? Math.round(sw * 0.12) : 0;
    const out = [];
    for (let top = 0; top < sh && out.length < 8; top += pieceH - overlap) {
      const height = Math.min(pieceH, sh - top);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, sw, height);
      ctx.drawImage(img, 0, top / scale, w, height / scale, 0, 0, sw, height);
      out.push(canvas.toDataURL('image/jpeg', 0.85));
      if (top + height >= sh) break;
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
const dayLabel = (d) => { const x = d ? parseISO(d) : null; return x && isValid(x) ? format(x, 'EEE, MMM d') : d; };

export default function PhotoImportSheet({ open, onClose, sharingDefault = '', onAdded }) {
  const qc = useQueryClient();
  const { me } = useFamily();
  const [familyMembers, setFamilyMembers] = useState([]);
  const [step, setStep] = useState('pick'); // pick | reading | review | saving
  const [hint, setHint] = useState('');
  const [found, setFound] = useState([]);
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [who, setWho] = useState(KEEP);
  // What's already on the calendar on the photo's days (lib/photoDupes), and
  // whether the ones already there are shown.
  const [calendar, setCalendar] = useState([]);
  const [showDups, setShowDups] = useState(false);
  // Not on the new schedule: which to take off (id -> on), when changed by hand.
  const [offPick, setOffPick] = useState({});
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('pick'); setFound([]); setNote(''); setPlace(''); setWho(KEEP); setHint(''); setCalendar([]); setShowDups(false); setOffPick({});
    base44.entities.FamilyMember.list().then((rows) => setFamilyMembers((rows || []).filter((m) => m.is_active !== false))).catch(() => {});
  }, [open]);

  const people = useMemo(() => orderMembers(familyMembers, me?.id), [familyMembers, me?.id]);
  const nameOf = (id) => familyMembers.find((m) => m.id === id)?.name || '';

  const read = async (files) => {
    const list = [...(files || [])].slice(0, 4);
    if (!list.length) return;
    setStep('reading');
    try {
      const images = [];
      for (const f of list) images.push(...(await piecesOf(f)));
      const res = await base44.functions.invoke('photoEvents', {
        images: images.slice(0, 8),
        hint: hint.trim(),
        today: format(new Date(), 'yyyy-MM-dd'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const out = res?.data || res;
      if (!out?.ok) throw new Error(out?.error || 'failed');
      const events = out.events || [];
      track('action', 'photo import: read', `${events.length} found`);
      // Everything on the calendar those days, repeating events included, to
      // tell what's already there (lib/photoDupes).
      let existing = [];
      if (events.length) {
        const dates = events.map((e) => e.date).sort();
        const from = parseISO(dates[0]);
        const to = parseISO(dates[dates.length - 1]);
        existing = expandAppointments((await listEvents(from, to).catch(() => [])) || [], from, to);
      }
      setCalendar(existing);
      setShowDups(false);
      setOffPick({});
      // on: left unset means "whatever the check says" (already there: off).
      setFound(events.map((e, i) => ({ ...e, key: `${i}`, on: undefined })));
      // Everything for the same person: preselect them.
      const ids = [...new Set(events.map((e) => e.member_id).filter(Boolean))];
      if (ids.length === 1 && events.every((e) => e.member_id === ids[0])) setWho(ids[0]);
      setNote(out.note || '');
      setStep('review');
    } catch (e) {
      const msg = String(e?.message || '');
      toast({
        title: msg === 'unreadable' ? "That photo couldn't be opened" : "Couldn't read that photo",
        description: msg === 'unreadable' ? 'Take a screenshot of it and pick the screenshot instead.' : 'Check your connection and try again.',
        variant: 'destructive',
      });
      setStep('pick');
    }
  };

  const update = (key, patch) => setFound((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  // Checked again whenever a row or "Who it's for" changes: the same visit for
  // someone else isn't already there.
  const personOf = (e) => (who === KEEP ? e.member_id || '' : who === NOBODY ? '' : who);
  const rows = useMemo(() => {
    const m = matchCalendar(found, calendar, personOf);
    return found.map((e, i) => ({ ...e, dup: m[i].dup, moved: m[i].moved, on: e.on ?? !m[i].dup }));
  }, [found, calendar, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = rows.filter((e) => !e.dup);
  const dups = rows.filter((e) => e.dup);
  const chosen = rows.filter((e) => e.on);
  // On the calendar at the same place in the photo's dates but not on it. The
  // ones from an earlier photo start ticked; ones added by hand don't.
  const gone = useMemo(() => notOnSchedule(rows, calendar, { place: place.trim(), personOf, today: format(new Date(), 'yyyy-MM-dd') })
    .map((a) => ({ ...a, off: offPick[a.id] ?? !!a.import_id })), [rows, calendar, place, offPick]); // eslint-disable-line react-hooks/exhaustive-deps
  const toRemove = gone.filter((a) => a.off);
  const goneIds = new Set(toRemove.map((a) => a.id));
  const placeLabel = String(place.trim() || rows.find((e) => e.location)?.location || '').split(',')[0];

  // After they're on the calendar: GenCare fills in what was left (category,
  // care, and with "GenCare decides", sharing), once for each kind of event
  // with the same answer for its twins (a run of PT visits is sorted once, not
  // 12 times), a few kinds at a time. Then one push per person for the lot.
  const sortAndTell = async (made, removedCount = 0, ctl = {}) => {
    const groups = new Map();
    for (const m of made) {
      const k = `${m.created.title}|${m.created.location}|${m.created.family_member_id}|${m.left.member}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    const lists = [...groups.values()];
    const results = [];
    for (let i = 0; i < lists.length; i += 4) {
      results.push(...await Promise.all(lists.slice(i, i + 4).map(async (list) => {
        const r = await sortNewEvent(list[0].created, list[0].left, sharingDefault, { away: false }).catch(() => null);
        if (r?.patch) await Promise.all(list.slice(1).map((m) => base44.entities.Appointment.update(m.created.id, r.patch).catch(() => {})));
        return { r, n: list.length };
      })));
    }
    // The family's "<name>: doctor" stand-ins, made once for the lot.
    if (results.some((x) => x.r?.needsAway)) await base44.functions.invoke('phoneCalendar', { mode: 'away' }).catch(() => {});
    // Undone already: the family never hears about it.
    if (ctl.undone) return;
    ctl.told = true;
    base44.functions.invoke('notifyFamily', { kind: 'appointments', appointment_ids: made.map((m) => m.created.id), removed_count: removedCount }).catch(() => {});
    qc.invalidateQueries({ queryKey: ['appointments'] });
    exportSoon();
    if (sharingDefault !== 'auto') return;
    const shared = results.filter((x) => x.r?.shared === true).reduce((s, x) => s + x.n, 0);
    const kept = made.length - shared;
    toast(shared && kept
      ? { title: `${shared} shared with the family, ${kept} kept just for you`, description: 'Tap an event to change it.' }
      : shared ? { title: 'Shared with the whole family', description: 'Tap an event to change it.' }
      : { title: 'Kept just for you', description: 'Tap an event to share it.' });
  };

  // Undo, right after: what was added comes off and what was taken off comes back.
  const undoToast = (title, made, removed, ctl) => {
    const t = toast({
      title,
      description: made.length ? 'They\'re on the calendar now.' : 'Add the new schedule with From a photo.',
      action: (
        <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium shrink-0" onClick={async () => {
          t.dismiss();
          ctl.undone = true;
          await takeOff(made, { tell: !!ctl.told });
          await putBack(removed);
          track('action', 'photo import: undone');
          qc.invalidateQueries({ queryKey: ['appointments'] });
          exportSoon();
          toast({ title: 'Undone', description: 'The calendar is back the way it was.' });
        }}>Undo</button>
      ),
    });
  };

  const add = async () => {
    if (!chosen.length && !toRemove.length) return;
    setStep('saving');
    const removed = toRemove.map(({ off: _o, ...a }) => a);
    // Only taking off (nothing new on the photo): that's all.
    if (!chosen.length) {
      try {
        const n = await takeOff(removed);
        track('action', 'photo import: taken off', `${n}`);
        qc.invalidateQueries({ queryKey: ['appointments'] });
        exportSoon();
        undoToast(n === 1 ? 'Took off 1 event' : `Took off ${n} events`, [], removed, { told: true });
        onClose();
      } catch {
        toast({ title: "Couldn't take them off", description: 'Check your connection and try again.', variant: 'destructive' });
        setStep('review');
      }
      return;
    }
    const now = new Date().toISOString();
    const importId = newImportId();
    const made = [];
    try {
      // Saved a few at a time, side by side (one by one, 19 visits took
      // seconds before anything showed).
      const toSave = chosen.map((e) => {
        const memberId = who === KEEP ? e.member_id : who === NOBODY ? '' : who;
        const data = {
          title: e.title.trim() || 'Appointment',
          date: e.date,
          time: e.all_day ? '' : e.time,
          end_time: e.all_day ? '' : e.end_time || '',
          all_day: !!e.all_day,
          category: 'Appointment',
          family_member_id: memberId || '',
          family_member_name: memberId ? nameOf(memberId) : '',
          location: place.trim() || e.location || '',
          doctor_name: e.with || '',
          // Who it's with goes in the notes too: the event screens show notes,
          // not the "with" field (Anna, Nov 9 2026: "did it save ... the
          // therapist's name?").
          notes: [e.with ? `With ${e.with}` : '', e.notes || ''].filter(Boolean).join('\n'),
          reminder_minutes: 60,
          end_date: '',
          recurrence: e.recurrence || '',
          visibility: startingVisibility(sharingDefault),
          shared_with: [],
          last_changed_at: now,
          source: 'app',
          import_id: importId,
        };
        const left = { visibility: sharingDefault === 'auto', member: !memberId, category: true };
        data.auto_set = [left.visibility && 'visibility', 'category'].filter(Boolean);
        return { key: e.key, data, left };
      });
      for (let i = 0; i < toSave.length; i += 6) {
        const saved = await Promise.all(toSave.slice(i, i + 6).map(({ key, data, left }) => base44.entities.Appointment.create(withFamily(data))
          .then((created) => (created?.id ? { key, created, left } : null), (err) => ({ err }))));
        made.push(...saved.filter((s) => s?.created));
        const failed = saved.find((s) => s?.err);
        if (failed) throw failed.err;
      }
      // On the calendar right away (Anna, Nov 9 2026: "it showed up late.
      // Just make sure it shows up instantly"); the sorting and the family's
      // push follow in the background.
      track('action', 'photo import: added', `${made.length}`);
      // What the new schedule replaces comes off now; the push about the new
      // ones says how many (one push, not two).
      const gone = removed.length ? await takeOff(removed, { tell: false }) : 0;
      if (gone) track('action', 'photo import: replaced', `${gone}`);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      exportSoon();
      const ctl = { undone: false, told: false };
      undoToast((made.length === 1 ? 'Added 1 event' : `Added ${made.length} events`) + (gone ? `, took off ${gone}` : ''), made.map((m) => m.created), removed, ctl);
      onAdded?.(chosen[0]?.date, made.map((m) => m.created));
      onClose();
      sortAndTell(made, gone, ctl);
    } catch (e) {
      // The ones that did save stay saved (and get sorted); they're unticked
      // here so trying again adds only the rest.
      if (made.length) {
        const done = new Set(made.map((m) => m.key));
        setFound((list) => list.map((x) => (done.has(x.key) ? { ...x, on: false } : x)));
        sortAndTell(made);
      }
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: made.length ? `Added ${made.length}, then something went wrong` : "Couldn't add them", description: 'Check the calendar, then try the rest again.', variant: 'destructive' });
      setStep('review');
    }
  };

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
    </>
  );

  // One event read from the photo, to check and fix before it's added.
  const renderRow = (e) => (
    <li key={e.key} className={`rounded-xl border p-3 ${e.on ? 'border-primary/40 bg-primary/5' : 'border-border opacity-70'}`}>
        <div className="flex items-start gap-3">
          <Checkbox checked={e.on} onCheckedChange={(v) => update(e.key, { on: !!v })} className="mt-2.5" aria-label="Add this one" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Input value={e.title} onChange={(ev) => update(e.key, { title: ev.target.value })} className="h-9" aria-label="What" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={e.date} onChange={(ev) => ev.target.value && update(e.key, { date: ev.target.value })} className="h-9 min-w-0 w-full px-2" aria-label="Day" />
              <Input type="time" value={e.all_day ? '' : e.time} onChange={(ev) => update(e.key, { time: ev.target.value, all_day: !ev.target.value })} className="h-9 min-w-0 w-full px-2" aria-label="Time" />
            </div>
            <p className="text-xs text-muted-foreground">
              {[dayLabel(e.date), e.all_day ? 'All day' : fmtTime(e.time), e.with, (place || e.location) || '', (who === KEEP ? nameOf(e.member_id) : who === NOBODY ? '' : nameOf(who))].filter(Boolean).join(' · ')}
              {e.recurrence && <span className="inline-flex items-center gap-0.5 ml-1"><Repeat className="w-3 h-3" /> repeats</span>}
            </p>
            {e.notes && <p className="text-xs text-muted-foreground line-clamp-2">{e.notes}</p>}
            {e.dup && <p className="text-xs text-emerald-700 dark:text-emerald-300">Already on your calendar: "{e.dup.own?.title || e.dup.title}"{e.dup.all_day || !e.dup.time ? '' : ` at ${fmtTime(e.dup.time)}`}</p>}
            {e.moved && <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1"><AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Your calendar also has "{e.moved.own?.title || e.moved.title}" at {fmtTime(e.moved.time)} that day. {goneIds.has(e.moved.id) ? 'It comes off with the ones below.' : 'If the visit moved, delete that one after adding this.'}</p>}
            {e.check && <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {e.check}</p>}
          </div>
        </div>
      </li>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== 'saving' && step !== 'reading') onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add from a photo</DialogTitle>
          <DialogDescription>
            {step === 'review'
              ? (found.length ? 'Check these before they go on the calendar.' : 'No dates found.')
              : 'A photo or screenshot of an appointment card, a schedule or a flyer. GenCare finds the dates, and you check them before anything is added.'}
          </DialogDescription>
        </DialogHeader>
        {fileInputs}

        {step === 'pick' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="photo-hint">Anything to add? (optional)</Label>
              <Textarea id="photo-hint" value={hint} onChange={(e) => setHint(e.target.value)} rows={2} maxLength={300} className="mt-1"
                placeholder="Like where they all are, or who they're for" />
            </div>
            <Button className="w-full h-12 rounded-xl gap-2" onClick={() => cameraRef.current?.click()}><Camera className="w-4 h-4" /> Take a photo</Button>
            <Button variant="outline" className="w-full h-12 rounded-xl gap-2" onClick={() => libraryRef.current?.click()}><ImagePlus className="w-4 h-4" /> Choose a photo or screenshot</Button>
            <p className="text-xs text-muted-foreground">The photo is only read for its dates. It isn't saved.</p>
          </div>
        )}

        {step === 'reading' && (
          <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm">Reading the dates…</p>
          </div>
        )}

        {(step === 'review' || step === 'saving') && (
          found.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{note || "GenCare couldn't find any dates in that photo."} Try a closer, straighter photo, or a screenshot.</p>
              <Button className="w-full h-11 rounded-xl" onClick={() => setStep('pick')}>Try another photo</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-3 space-y-3">
                <p className="text-sm font-medium">For all of these (optional)</p>
                <div>
                  <Label>Where</Label>
                  <AddressField value={place} onChange={setPlace} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Leave it empty to keep the place each one shows.</p>
                </div>
                <div>
                  <Label>Who it's for</Label>
                  <Select value={who} onValueChange={setWho}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP}>As read from the photo</SelectItem>
                      {people.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      <SelectItem value={NOBODY}>Nobody in particular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {dups.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {fresh.length === 0
                    ? (dups.length === 1 ? 'This is already on your calendar.' : `All ${dups.length} of these are already on your calendar.`)
                    : `${dups.length} ${dups.length === 1 ? 'is' : 'are'} already on your calendar, so ${dups.length === 1 ? "it's" : "they're"} skipped.`}
                </p>
              )}
              <ul className="space-y-2">
                {fresh.map(renderRow)}
              </ul>
              {gone.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Not on this schedule anymore ({gone.length})</p>
                  <p className="text-xs text-muted-foreground">
                    On your calendar{placeLabel ? ` at ${placeLabel}` : ''} between {dayLabel(gone[0].date)} and {dayLabel(gone[gone.length - 1].date)}, but not on this photo. The checked ones come off the calendar.
                  </p>
                  <ul className="space-y-2">
                    {gone.map((a) => (
                      <li key={a.id} className={`rounded-xl border p-3 flex items-start gap-3 ${a.off ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                        <Checkbox checked={a.off} onCheckedChange={(v) => setOffPick((p) => ({ ...p, [a.id]: !!v }))} className="mt-0.5" aria-label={`Take off ${a.title}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${a.off ? 'line-through text-muted-foreground' : ''}`}>{a.title}</p>
                          <p className="text-xs text-muted-foreground">{[dayLabel(a.date), a.all_day || !a.time ? 'All day' : fmtTime(a.time), a.import_id ? '' : 'added by hand'].filter(Boolean).join(' · ')}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dups.length > 0 && (
                <div className="space-y-2">
                  <button type="button" onClick={() => setShowDups((v) => !v)} aria-expanded={showDups}
                    className="w-full flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium">
                    Already on your calendar ({dups.length})
                    <ChevronDown className={`w-4 h-4 transition-transform ${showDups ? 'rotate-180' : ''}`} />
                  </button>
                  {showDups && (
                    <ul className="space-y-2">
                      {dups.map(renderRow)}
                    </ul>
                  )}
                </div>
              )}

              <div className="sticky -bottom-6 -mb-6 bg-background pt-2 pb-6 space-y-2">
                <Button className="w-full h-12 rounded-xl" disabled={(!chosen.length && !toRemove.length) || step === 'saving'} onClick={add}>
                  {step === 'saving' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                    : !chosen.length && !toRemove.length ? 'Nothing new to add'
                    : [chosen.length ? (chosen.length === 1 ? 'Add 1 event' : `Add ${chosen.length} events`) : '',
                      toRemove.length ? `${chosen.length ? 'take off' : 'Take off'} ${toRemove.length}${chosen.length ? '' : toRemove.length === 1 ? ' event' : ' events'}` : ''].filter(Boolean).join(', ')}
                </Button>
                <Button variant="ghost" className="w-full rounded-xl" disabled={step === 'saving'} onClick={() => setStep('pick')}>Use a different photo</Button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

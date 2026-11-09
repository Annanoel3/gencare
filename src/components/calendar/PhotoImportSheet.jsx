import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid } from 'date-fns';
import { Camera, ImagePlus, Loader2, Repeat, AlertCircle } from 'lucide-react';
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

// Add to the calendar from a photo (Anna, Nov 9 2026): an appointment card, a
// school calendar, a flyer, a screenshot. GenCare reads the dates
// (functions/photoEvents), the person checks them, and only then are they
// added. "Where" and "For" at the top go on every event (Anna: "all
// appointments are at the same location"). The photo isn't kept.

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
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('pick'); setFound([]); setNote(''); setPlace(''); setWho(KEEP); setHint('');
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
      // Already on the calendar at that day and time? Then it starts unticked.
      let existing = [];
      if (events.length) {
        const dates = events.map((e) => e.date).sort();
        existing = (await listEvents(parseISO(dates[0]), parseISO(dates[dates.length - 1])).catch(() => [])) || [];
      }
      setFound(events.map((e, i) => {
        const dup = existing.find((a) => a.date === e.date && (a.all_day || !a.time ? e.all_day : String(a.time).slice(0, 5) === e.time) && !a.away_of);
        return { ...e, key: `${i}`, on: !dup, dup: dup ? dup.title : '' };
      }));
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
  const chosen = found.filter((e) => e.on);

  const add = async () => {
    if (!chosen.length) return;
    setStep('saving');
    const now = new Date().toISOString();
    const made = [];
    try {
      for (const e of chosen) {
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
          notes: e.notes || '',
          reminder_minutes: 60,
          end_date: '',
          recurrence: e.recurrence || '',
          visibility: startingVisibility(sharingDefault),
          shared_with: [],
          last_changed_at: now,
          source: 'app',
        };
        const left = { visibility: sharingDefault === 'auto', member: !memberId, category: true };
        data.auto_set = [left.visibility && 'visibility', 'category'].filter(Boolean);
        const created = await base44.entities.Appointment.create(withFamily(data));
        if (created?.id) made.push({ created, left });
      }
      // GenCare fills in what was left (category, care, and with "GenCare
      // decides", sharing) — once for each kind of event, then the same
      // answer for its twins (a run of PT visits is sorted once, not 12 times).
      const groups = new Map();
      for (const m of made) {
        const k = `${m.created.title}|${m.created.location}|${m.created.family_member_id}|${m.left.member}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(m);
      }
      for (const list of groups.values()) {
        const r = await sortNewEvent(list[0].created, list[0].left, sharingDefault).catch(() => null);
        if (!r?.patch) continue;
        for (const m of list.slice(1)) await base44.entities.Appointment.update(m.created.id, r.patch).catch(() => {});
      }
      // One push per person for the lot (not one per event).
      base44.functions.invoke('notifyFamily', { kind: 'appointments', appointment_ids: made.map((m) => m.created.id) }).catch(() => {});
      track('action', 'photo import: added', `${made.length}`);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      exportSoon();
      toast({ title: made.length === 1 ? 'Added 1 event' : `Added ${made.length} events`, description: 'They\'re on the calendar now.' });
      onAdded?.(chosen[0]?.date);
      onClose();
    } catch (e) {
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

              <ul className="space-y-2">
                {found.map((e) => (
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
                        {e.dup && <p className="text-xs text-amber-700 dark:text-amber-300">Already on the calendar at this time: "{e.dup}"</p>}
                        {e.check && <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {e.check}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="sticky -bottom-6 -mb-6 bg-background pt-2 pb-6 space-y-2">
                <Button className="w-full h-12 rounded-xl" disabled={!chosen.length || step === 'saving'} onClick={add}>
                  {step === 'saving' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding…</> : chosen.length === 1 ? 'Add 1 event' : `Add ${chosen.length} events`}
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

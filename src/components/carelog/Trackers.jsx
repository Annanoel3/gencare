import React, { useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { LineChart, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { createLog, deleteLog, nowLocal } from '@/lib/careLog';
import { track } from '@/lib/activity';

// "Track something" (Anna, Nov 10 2026): an area to record anything, named by
// the family, the way she tracks readings in ADHDone without the app offering
// a health feature: "the person could put blood pressure but the app is not
// going to offer blood pressure". Each tracker is just a name; a reading is
// what they typed (one number, or a few together like "120/80 72"), a note and
// a time, with a small chart of the numbers. Stored as care-log entries
// (entry_type "tracker", title = the tracker's name, value/value_b/value_c =
// the numbers, response = the reading as typed).

const LINE_COLORS = ['#2f855a', '#c05621', '#2b6cb0'];
export const numbersIn = (text) => (String(text || '').match(/-?\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
const first = (s) => String(s || '').trim().split(' ')[0];

function Chart({ readings }) {
  // Oldest to newest, the last 30; one line per number in the reading.
  const pts = readings.slice(0, 30).reverse();
  const series = [0, 1, 2].map((i) => pts.map((r) => [r.value, r.value_b, r.value_c][i]).map((v) => (typeof v === 'number' ? v : null)));
  const all = series.flat().filter((v) => v !== null);
  if (pts.length < 2 || !all.length) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const W = 300, H = 90, pad = 6;
  const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, pts.length - 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img" aria-label="Chart of the readings">
      {series.map((s, i) => {
        const d = s.map((v, j) => (v === null ? null : `${x(j)},${y(v)}`)).filter(Boolean);
        if (d.length < 2) return null;
        return (
          <g key={i}>
            <polyline points={d.join(' ')} fill="none" stroke={LINE_COLORS[i]} strokeWidth="2" strokeLinejoin="round" />
            {s.map((v, j) => (v === null ? null : <circle key={j} cx={x(j)} cy={y(v)} r="2.5" fill={LINE_COLORS[i]} />))}
          </g>
        );
      })}
    </svg>
  );
}

export default function Trackers({ person, logs, me, onChanged }) {
  const [open, setOpen] = useState(null); // { name } of the tracker being added to, '' for a new one
  const [view, setView] = useState(null); // a tracker's name, to see its history
  const [form, setForm] = useState({ name: '', reading: '', notes: '', when: nowLocal() });
  const [saving, setSaving] = useState(false);

  const trackers = useMemo(() => {
    const byName = new Map();
    for (const l of logs) {
      if (l.entry_type !== 'tracker' || !l.title) continue;
      const k = l.title.trim().toLowerCase();
      if (!byName.has(k)) byName.set(k, { name: l.title.trim(), readings: [] });
      byName.get(k).readings.push(l);
    }
    return [...byName.values()];
  }, [logs]);

  const start = (name) => { setForm({ name: name || '', reading: '', notes: '', when: nowLocal() }); setOpen({ name: name || '' }); };
  const save = async () => {
    const name = form.name.trim();
    const reading = form.reading.trim();
    if (!name || !reading) return;
    const [a, b, c] = numbersIn(reading);
    setSaving(true);
    try {
      await createLog({
        family_member_id: person.id,
        family_member_name: person.name,
        entry_type: 'tracker',
        title: name,
        response: reading,
        ...(typeof a === 'number' ? { value: a } : {}),
        ...(typeof b === 'number' ? { value_b: b } : {}),
        ...(typeof c === 'number' ? { value_c: c } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        timestamp: new Date(form.when || Date.now()).toISOString(),
        logged_by_user_id: me?.id,
        logged_by_name: me?.display_name || me?.full_name || '',
      });
      track('action', 'log:tracker');
      setOpen(null);
      onChanged?.();
    } catch {
      toast({ title: "Couldn't save it", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const viewing = trackers.find((t) => t.name === view);

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2"><LineChart className="w-4 h-4 text-primary" /> Track something</h2>
        <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full" onClick={() => start('')}><Plus className="w-4 h-4" /> New</Button>
      </div>
      {trackers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Anything the family wants to keep an eye on for {first(person.name)}. Name it whatever you like, then add a reading whenever you check.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {trackers.map((t) => {
            const last = t.readings[0];
            const d = last?.timestamp ? parseISO(last.timestamp) : null;
            return (
              <li key={t.name} className="flex items-center gap-3 py-2">
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setView(t.name)}>
                  <span className="block text-sm font-medium truncate">{t.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{last?.response}{d && isValid(d) ? ` · ${format(d, 'MMM d, h:mm a')}` : ''}{last?.logged_by_name ? ` · ${first(last.logged_by_name)}` : ''}</span>
                </button>
                <Button size="sm" variant="secondary" className="h-8 rounded-full" onClick={() => start(t.name)}>Add</Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o && !saving) setOpen(null); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>{open?.name ? open.name : 'Track something new'}</DialogTitle>
            <DialogDescription>For {first(person.name)}. Everyone in the family can see it.</DialogDescription>
          </DialogHeader>
          {!open?.name && (
            <div>
              <Label>What are you tracking?</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name it anything" className="mt-1" />
            </div>
          )}
          <div>
            <Label>Reading</Label>
            <Input value={form.reading} onChange={(e) => setForm({ ...form, reading: e.target.value })} placeholder="A number, or a few together" inputMode="text" className="mt-1" />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1" />
          </div>
          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} className="mt-1" />
          </div>
          <Button className="w-full h-11 rounded-xl" disabled={saving || !form.name.trim() || !form.reading.trim()} onClick={save}>Save reading</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setView(null); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>{first(person.name)} · {viewing?.readings.length} reading{viewing?.readings.length === 1 ? '' : 's'}</DialogDescription>
          </DialogHeader>
          {viewing && <Chart readings={viewing.readings} />}
          <ul className="divide-y divide-border/40">
            {viewing?.readings.map((r) => {
              const d = r.timestamp ? parseISO(r.timestamp) : null;
              return (
                <li key={r.id} className="py-2 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.response}</p>
                    {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                    <p className="text-xs text-muted-foreground">{d && isValid(d) ? format(d, 'MMM d, h:mm a') : ''}{r.logged_by_name ? ` · ${first(r.logged_by_name)}` : ''}</p>
                  </div>
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={async () => { try { await deleteLog(r.id); onChanged?.(); } catch { /* stays */ } }}>Delete</button>
                </li>
              );
            })}
          </ul>
          {viewing && <Button variant="secondary" className="w-full rounded-xl" onClick={() => { const n = viewing.name; setView(null); start(n); }}>Add a reading</Button>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

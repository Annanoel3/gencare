import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { createLog, updateLog } from '@/lib/careLog';
import { track } from '@/lib/activity';

// The top of a baby's Care Log, the way dedicated baby trackers do it (Anna,
// Nov 10 2026: "just as effective as a baby tracker and just as user-friendly"):
// how long since the last feed (and which side), the last diaper, and whether
// the baby is asleep, with timers for nursing (left/right, switch sides) and
// sleep (start, then "Woke up").
//
// A running timer is a care-log row with status "pending", so it shows on
// every phone in the family and anyone can stop it. Nursing keeps the side it's
// on in `side`, when that side started in `time` (ISO), and the minutes so far
// in `value` (left) and `value_b` (right); Done adds them up into `minutes`.
// Sleep starts with the time it began and Woke up fills in `minutes`.

const ms = (iso) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };
const round1 = (n) => Math.round(n * 10) / 10;

/** "2h 10m ago", "45m ago", "just now". */
const ago = (fromMs, nowMs) => { const t = since(fromMs, nowMs); return t === 'just now' ? t : `${t} ago`; };

/** "2h 10m", "45m", "just now". */
export function since(fromMs, nowMs = Date.now()) {
  if (fromMs == null) return '';
  const m = Math.max(0, Math.floor((nowMs - fromMs) / 60000));
  if (m < 1) return 'just now';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

function useTick(active) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), active ? 15000 : 60000);
    return () => clearInterval(id);
  }, [active]);
}

export default function BabyTimers({ person, logs, me, onChanged }) {
  const nursing = logs.find((l) => l.entry_type === 'feeding' && l.sub_type === 'nursing' && l.status === 'pending');
  const sleeping = logs.find((l) => l.entry_type === 'sleep' && l.status === 'pending');
  useTick(!!(nursing || sleeping));
  const [busy, setBusy] = useState('');
  const now = Date.now();
  const first = String(person?.name || '').split(' ')[0] || 'Baby';

  const lastFeed = logs.find((l) => l.entry_type === 'feeding' && l.status !== 'pending');
  const lastDiaper = logs.find((l) => l.entry_type === 'diaper');
  const lastSleep = logs.find((l) => l.entry_type === 'sleep' && l.status !== 'pending' && Number(l.minutes) > 0);
  const wokeAt = lastSleep ? ms(lastSleep.timestamp) + Number(lastSleep.minutes) * 60000 : null;

  const base = () => ({
    family_member_id: person.id,
    family_member_name: person.name,
    band: 'baby',
    logged_by_user_id: me?.id,
    logged_by_name: me?.display_name || me?.full_name || '',
  });
  const run = async (key, fn, done) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); onChanged?.(); if (done) toast(done); } catch {
      toast({ title: "Couldn't save that", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  // Minutes on each side so far, counting the side it's on now.
  const sides = (row, at = Date.now()) => {
    const extra = Math.max(0, (at - (ms(row.time) || ms(row.timestamp) || at)) / 60000);
    const left = Number(row.value) || 0;
    const right = Number(row.value_b) || 0;
    return row.side === 'right' ? { left, right: right + extra } : { left: left + extra, right };
  };

  const startNursing = (side) => run(`nurse-${side}`, async () => {
    const iso = new Date().toISOString();
    await createLog({ ...base(), entry_type: 'feeding', sub_type: 'nursing', side, status: 'pending', timestamp: iso, time: iso, value: 0, value_b: 0, unit: 'min' });
    track('action', 'log:nursing timer');
  });
  const switchSide = () => run('switch', async () => {
    const s = sides(nursing);
    await updateLog(nursing.id, { side: nursing.side === 'right' ? 'left' : 'right', time: new Date().toISOString(), value: round1(s.left), value_b: round1(s.right) });
  });
  const doneNursing = () => run('nurse-done', async () => {
    const s = sides(nursing);
    await updateLog(nursing.id, { status: 'done', time: '', value: Math.round(s.left), value_b: Math.round(s.right), minutes: Math.max(1, Math.round(s.left + s.right)) });
  }, { title: `Feed logged for ${first}`, description: 'Everyone in the family can see it.' });

  const startSleep = () => run('sleep', async () => {
    const h = new Date().getHours();
    await createLog({ ...base(), entry_type: 'sleep', sub_type: h >= 19 || h < 6 ? 'night' : 'nap', status: 'pending', timestamp: new Date().toISOString() });
    track('action', 'log:sleep timer');
  });
  const wokeUp = () => run('woke', async () => {
    await updateLog(sleeping.id, { status: 'done', minutes: Math.max(1, Math.round((Date.now() - ms(sleeping.timestamp)) / 60000)) });
  }, { title: `${first} is awake`, description: 'The sleep is logged for everyone.' });

  const feedLine = lastFeed
    ? `${ago(ms(lastFeed.timestamp), now)}${lastFeed.sub_type === 'nursing' && lastFeed.side ? ` · ${lastFeed.side === 'both' ? 'both sides' : `${lastFeed.side} side`}` : lastFeed.sub_type === 'bottle' && lastFeed.amount ? ` · ${lastFeed.amount} oz` : ''}`
    : 'Not logged yet';

  const nursingFor = nursing ? since(ms(nursing.timestamp), now) : '';
  const sleepingFor = sleeping ? since(ms(sleeping.timestamp), now) : '';
  const wet = logs.filter((l) => l.entry_type === 'diaper' && ['wet', 'mixed'].includes(l.sub_type) && isTodayIso(l.timestamp)).length;
  const dirty = logs.filter((l) => l.entry_type === 'diaper' && ['dirty', 'mixed'].includes(l.sub_type) && isTodayIso(l.timestamp)).length;
  const tile = 'rounded-2xl border border-border/60 bg-card px-2.5 py-2 min-w-0';

  // A strip of three (fed, sleep, diaper), a banner for a running timer, and
  // the buttons that start one: compact, so the log buttons stay in view.
  return (
    <section className="space-y-2" aria-label={`${first} right now`}>
      <div className="grid grid-cols-3 gap-2">
        <div className={tile}>
          <p className="text-[11px] text-muted-foreground">🍼 Last fed</p>
          <p className="text-sm font-semibold leading-tight mt-0.5">{nursing ? 'Nursing now' : lastFeed ? ago(ms(lastFeed.timestamp), now) : '—'}</p>
          {!nursing && lastFeed && <p className="text-[11px] text-muted-foreground truncate">{feedLine.split(' · ').slice(1).join(' · ') || (lastFeed.sub_type || '')}</p>}
        </div>
        <div className={tile}>
          <p className="text-[11px] text-muted-foreground">{sleeping ? '😴 Asleep' : '☀️ Awake'}</p>
          <p className="text-sm font-semibold leading-tight mt-0.5">{sleeping ? (sleepingFor === 'just now' ? '0m' : sleepingFor) : wokeAt ? since(wokeAt, now) : '—'}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-muted-foreground">🧷 Diaper</p>
          <p className="text-sm font-semibold leading-tight mt-0.5">{lastDiaper ? ago(ms(lastDiaper.timestamp), now) : '—'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{wet} wet · {dirty} dirty</p>
        </div>
      </div>

      {nursing && (
        <div className="rounded-2xl border border-primary bg-primary/5 p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">🤱 Nursing · {nursing.side} side · {nursingFor === 'just now' ? '0m' : nursingFor}</p>
            <p className="text-xs text-muted-foreground">Left {Math.round(sides(nursing, now).left)}m · Right {Math.round(sides(nursing, now).right)}m</p>
          </div>
          <Button size="sm" variant="secondary" className="h-9 rounded-full" disabled={!!busy} onClick={switchSide}>Switch</Button>
          <Button size="sm" className="h-9 rounded-full" disabled={!!busy} onClick={doneNursing}>Done</Button>
        </div>
      )}
      {sleeping && (
        <div className="rounded-2xl border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 p-3 flex items-center gap-3">
          <p className="flex-1 min-w-0 text-sm font-semibold">😴 Asleep {sleepingFor === 'just now' ? 'just now' : `for ${sleepingFor}`}</p>
          <Button size="sm" className="h-9 rounded-full" disabled={!!busy} onClick={wokeUp}>Woke up</Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {!nursing && <Button variant="secondary" className="h-10 rounded-full text-sm px-2" disabled={!!busy} onClick={() => startNursing('left')}>Nurse left</Button>}
        {!nursing && <Button variant="secondary" className="h-10 rounded-full text-sm px-2" disabled={!!busy} onClick={() => startNursing('right')}>Nurse right</Button>}
        {!sleeping && <Button variant="secondary" className="h-10 rounded-full text-sm px-2" disabled={!!busy} onClick={startSleep}>Fell asleep</Button>}
      </div>
    </section>
  );
}

function isTodayIso(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

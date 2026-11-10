import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isTomorrow } from 'date-fns';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { bandOf, createLog, deleteLog, nowLocal } from '@/lib/careLog';
import { track } from '@/lib/activity';
import { serverDate } from '@/lib/serverTime';
import {
  STASH_KEY, PLACE_LABEL, listStash, datesOf, stateOf, inOrder, nextToUse, ozText,
  addBag, moveBag, finishBag, restoreBag, bottlesPerDay,
} from '@/lib/milkStash';

// The milk stash on a baby's Care Log (lib/milkStash has the use-by rules).
// The summary says what's in the fridge and freezer, which bag to use next
// and anything about to go past its date; "See all" lists every bag, oldest
// first, with what can be done with each: use it for a bottle (which logs the
// bottle too), freeze it, thaw it, or toss it.

const whenShort = (d) => (isToday(d) ? `today ${format(d, 'h:mm a')}` : isTomorrow(d) ? `tomorrow ${format(d, 'h:mm a')}` : format(d, 'EEE, MMM d'));
const pumpedText = (bag) => { const d = serverDate(bag.pumped_at); return d ? `pumped ${isToday(d) ? format(d, 'h:mm a') : format(d, 'MMM d')}` : ''; };
function dateText(bag, now) {
  const { useBy, bestBy } = datesOf(bag);
  if (useBy <= now) return 'past its use-by date';
  if (bestBy && bestBy <= now) return `past its best date · use by ${whenShort(useBy)}`;
  if (bestBy) return `best by ${format(bestBy, 'MMM d, yyyy')}`;
  return `use by ${whenShort(useBy)}`;
}

export default function MilkStash({ person, logs = [], me, offer = true, onLogged }) {
  const qc = useQueryClient();
  const { data: all = [] } = useQuery({ queryKey: STASH_KEY, queryFn: listStash });
  const bags = useMemo(() => all.filter((b) => b.family_member_id === person.id && b.status === 'in'), [all, person.id]);
  const [adding, setAdding] = useState(false);
  const [seeing, setSeeing] = useState(false);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ amount: '', place: 'fridge', when: nowLocal() });
  const now = new Date();

  if (!offer && !bags.length) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: STASH_KEY });
  const first = String(person.name || '').split(' ')[0];
  const totals = ['thawed', 'fridge', 'freezer'].map((p) => {
    const here = bags.filter((b) => b.place === p);
    return { place: p, n: here.length, oz: here.reduce((a, b) => a + (Number(b.amount) || 0), 0) };
  }).filter((t) => t.n);
  const good = bags.filter((b) => stateOf(b, now) !== 'gone');
  const goodOz = good.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const gone = bags.filter((b) => stateOf(b, now) === 'gone');
  const soon = bags.filter((b) => stateOf(b, now) === 'soon' && b.place !== 'freezer');
  const next = nextToUse(bags, now);
  const perDay = bottlesPerDay(logs, now);
  const days = perDay ? Math.floor(goodOz / perDay) : null;

  const act = async (bag, what) => {
    setBusy(bag.id);
    try {
      if (what === 'bottle') {
        const log = await createLog({
          family_member_id: person.id, family_member_name: person.name, band: bandOf(person),
          entry_type: 'feeding', sub_type: 'bottle', amount: Number(bag.amount), unit: 'oz',
          timestamp: new Date().toISOString(), notes: 'From the milk stash',
          logged_by_user_id: me?.id, logged_by_name: me?.display_name || me?.full_name || '',
        });
        await finishBag(bag, 'used', log?.id);
        onLogged?.();
        track('action', 'stash:bottle');
        const t = toast({
          title: `🍼 ${ozText(bag.amount)} bottle logged for ${first}`,
          description: 'Taken out of the milk stash.',
          action: <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium shrink-0" onClick={async () => { t.dismiss(); try { await restoreBag(bag); if (log?.id) await deleteLog(log.id); refresh(); onLogged?.(); } catch { /* it stays */ } }}>Undo</button>,
        });
      } else if (what === 'toss') {
        await finishBag(bag, 'tossed');
        track('action', 'stash:toss');
        const t = toast({
          title: `${ozText(bag.amount)} tossed`,
          action: <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium shrink-0" onClick={async () => { t.dismiss(); try { await restoreBag(bag); refresh(); } catch { /* it stays */ } }}>Undo</button>,
        });
      } else {
        await moveBag(bag, what);
        track('action', `stash:${what}`);
        toast({ title: what === 'thawed' ? `${ozText(bag.amount)} thawing` : `${ozText(bag.amount)} in the freezer`, description: what === 'thawed' ? 'Use it within 24 hours. It can’t go back in the freezer.' : 'It’s best within 6 months of pumping.' });
      }
      refresh();
    } catch {
      toast({ title: "Couldn't save that", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) return;
    setBusy('add');
    try {
      await addBag({ person, amount, place: form.place, pumpedAt: form.when, me });
      track('action', 'stash:add', form.place);
      refresh();
      setAdding(false);
    } catch {
      toast({ title: "Couldn't add it", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  // What can be done with a bag where it is.
  const actions = (bag) => {
    const out = stateOf(bag, now) === 'gone';
    const btn = (label, what, variant = 'secondary') => (
      <Button key={what} size="sm" variant={variant} className="h-8 rounded-full px-3" disabled={busy === bag.id} onClick={() => act(bag, what)}>{label}</Button>
    );
    if (out) return [btn('Toss', 'toss')];
    if (bag.place === 'freezer') return [btn('Thaw', 'thawed'), btn('Toss', 'toss', 'ghost')];
    if (bag.place === 'fridge') return [btn('Bottle', 'bottle'), btn('Freeze', 'freezer', 'ghost'), btn('Toss', 'toss', 'ghost')];
    return [btn('Bottle', 'bottle'), btn('Toss', 'toss', 'ghost')];
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4" aria-label="Milk stash">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2"><span aria-hidden>🫙</span> Milk stash</h2>
        <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full" onClick={() => { setForm({ amount: '', place: 'fridge', when: nowLocal() }); setAdding(true); }}><Plus className="w-4 h-4" /> Add milk</Button>
      </div>

      {!bags.length ? (
        <p className="text-sm text-muted-foreground">Nothing stored. When you log pumping, you can put it straight in the fridge or freezer here, or add milk you already have.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {totals.map((t, i) => <span key={t.place}>{i > 0 && ' · '}<span className="font-medium">{ozText(t.oz)}</span> {t.place === 'thawed' ? 'thawed' : `in the ${t.place}`}</span>)}
            {days !== null && <span className="block text-xs text-muted-foreground">{days < 1 ? 'Less than a day' : `About ${days} day${days === 1 ? '' : 's'}`} of bottles, at {ozText(perDay)} a day this week.</span>}
          </p>
          {gone.length > 0 && <p className="text-xs text-red-700 dark:text-red-300">{gone.length} bag{gone.length === 1 ? ' is' : 's are'} past the use-by date ({ozText(gone.reduce((a, b) => a + Number(b.amount || 0), 0))}). Toss {gone.length === 1 ? 'it' : 'them'} in See all.</p>}
          {soon.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{soon.length} bag{soon.length === 1 ? '' : 's'} to use by {whenShort(inOrder(soon).map((b) => datesOf(b).useBy)[0])}.</p>}
          {next && (
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Use next</p>
                <p className="text-sm font-medium truncate">{ozText(next.amount)} · {PLACE_LABEL[next.place].toLowerCase()} · {pumpedText(next)}</p>
                <p className="text-xs text-muted-foreground truncate">{dateText(next, now)}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">{actions(next).slice(0, 1)}</div>
            </div>
          )}
          <button type="button" className="text-xs text-primary font-medium" onClick={() => setSeeing(true)}>See all {bags.length} bag{bags.length === 1 ? '' : 's'}</button>
        </div>
      )}

      <Dialog open={adding} onOpenChange={(o) => { if (!o && busy !== 'add') setAdding(false); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Add milk to the stash</DialogTitle>
            <DialogDescription>For {first}. Everyone in the family can see it.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>How much (oz)</Label>
            <Input type="number" inputMode="decimal" step="0.5" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Where</Label>
            <div className="flex gap-2 mt-1" role="radiogroup" aria-label="Where">
              {['fridge', 'freezer'].map((p) => (
                <button key={p} type="button" role="radio" aria-checked={form.place === p} onClick={() => setForm({ ...form, place: p })}
                  className={`h-9 px-4 rounded-full border text-sm ${form.place === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>{PLACE_LABEL[p]}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>When it was pumped</Label>
            <Input type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} className="mt-1" />
          </div>
          <Button className="w-full h-11 rounded-xl" disabled={busy === 'add' || !(Number(form.amount) > 0)} onClick={save}>Add it</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={seeing} onOpenChange={setSeeing}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Milk stash</DialogTitle>
            <DialogDescription>Oldest first. Dates follow the CDC’s storage times: 4 days in the fridge, best within 6 months in the freezer (12 at most), and 24 hours once thawed.</DialogDescription>
          </DialogHeader>
          {['thawed', 'fridge', 'freezer'].map((p) => {
            const here = inOrder(bags.filter((b) => b.place === p));
            if (!here.length) return null;
            return (
              <div key={p}>
                <h3 className="text-sm font-semibold mb-1">{PLACE_LABEL[p]} <span className="text-muted-foreground font-normal">· {ozText(here.reduce((a, b) => a + Number(b.amount || 0), 0))}</span></h3>
                <ul className="divide-y divide-border/40">
                  {here.map((b) => {
                    const st = stateOf(b, now);
                    return (
                      <li key={b.id} className="py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{ozText(b.amount)}</span>
                          <span className="text-xs text-muted-foreground">{pumpedText(b)}{b.added_by_name ? ` · ${String(b.added_by_name).split(' ')[0]}` : ''}</span>
                        </div>
                        <p className={`text-xs ${st === 'gone' ? 'text-red-700 dark:text-red-300' : st === 'soon' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{dateText(b, now)}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">{actions(b)}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!bags.length && <p className="text-sm text-muted-foreground">Nothing stored.</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

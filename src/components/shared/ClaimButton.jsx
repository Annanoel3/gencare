import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Hand, Loader2 } from 'lucide-react';
import { useFamily } from '@/lib/family';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/activity';
import { REMINDERS_KEY, todayStr } from '@/lib/reminders';
import { canClaim, claimDayFor, claimOn, firstName, setClaim } from '@/lib/claims';

/**
 * "I'll take it" on an event or a reminder (Anna, Oct 30 2026). Anyone who
 * can see it can take it; then everyone sees who's on it, its reminders go to
 * them, and only they can let it go. `date` is the day it happens (for
 * something that repeats, taking it is for that day only).
 */
export default function ClaimButton({ kind, item, date, className = '' }) {
  const qc = useQueryClient();
  const { me, members: accounts } = useFamily();
  const [busy, setBusy] = useState(false);
  // Shown right away; the real answer comes back with the refetch.
  const [local, setLocal] = useState(undefined);
  if (!canClaim(kind, item) || !me?.id) return null;

  const day = claimDayFor(kind, item, date);
  const saved = claimOn(item, day, accounts);
  const claim = local === undefined ? saved : local;
  const mine = claim && claim.user_id === me.id;
  // Nothing to take once it's over; who had it still shows.
  const past = kind === 'event' && !!date && date < todayStr() && !(item.end_date && item.end_date >= todayStr());
  if (!claim && past) return null;

  const run = async (take, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    setLocal(take ? { day, user_id: me.id, name: me.display_name || firstName(me.full_name) } : null);
    try {
      await setClaim({ kind, item, date, take });
      track('action', `${take ? 'claim' : 'unclaim'}:${kind}`);
      toast(take
        ? { title: "It's yours", description: "Everyone can see you're on it, and its reminders come to you." }
        : { title: 'Let go', description: "It's open again, and whoever added it knows." });
    } catch (err) {
      setLocal(undefined);
      toast({ title: take ? "Couldn't take it" : "Couldn't let go", description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: kind === 'event' ? ['appointments'] : REMINDERS_KEY });
      setLocal(undefined);
    }
  };

  const stop = (e) => { e.stopPropagation(); };
  const pill = 'inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 border';

  if (!claim) {
    return (
      <button type="button" onClick={(e) => run(true, e)} onKeyDown={stop} disabled={busy}
        className={`${pill} border-primary/40 text-primary bg-primary/5 active:bg-primary/15 ${className}`}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hand className="w-3.5 h-3.5" />} I'll take it
      </button>
    );
  }
  if (mine) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`} onClick={stop} role="presentation">
        <span className={`${pill} border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800`}>
          <Hand className="w-3.5 h-3.5" /> You're on it
        </span>
        {!past && (
          <button type="button" onClick={(e) => run(false, e)} disabled={busy} className="text-xs text-muted-foreground underline underline-offset-2">
            {busy ? 'Letting go…' : 'Let go'}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className={`${pill} border-border bg-muted/60 text-foreground ${className}`} onClick={stop} role="presentation">
      <Hand className="w-3.5 h-3.5" /> {firstName(claim.name) || 'Someone'}'s on it
    </span>
  );
}

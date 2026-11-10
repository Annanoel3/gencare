import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { serverDate } from '@/lib/serverTime';

// The milk stash (Anna, Nov 10 2026: "Milk stash sounds good"): stored breast
// milk for a baby, bag by bag, in ounces, with a use-by date for each and the
// oldest one first, like the dedicated pumping apps.
//
// Use-by times are the CDC's breast milk storage times (the same in the CDC
// guide Gerber reprints and Oregon WIC's Mar 2026 sheet):
//   fridge   4 days from pumping
//   freezer  best within 6 months of pumping, 12 months at most
//   thawed   24 hours in the fridge once thawed, and never back in the freezer
// A bag moved from the fridge to the freezer keeps its pumping date, so the
// freezer dates count from then.

export const STASH_KEY = ['milkStash'];
const HOUR = 3600000;
const DAY = 24 * HOUR;

export const PLACE_LABEL = { fridge: 'Fridge', freezer: 'Freezer', thawed: 'Thawed' };

export function listStash() {
  return base44.entities.MilkStash.filter({ status: 'in' }, 'pumped_at', 500);
}

const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/** { useBy, bestBy?, from } for a bag, as Dates. */
export function datesOf(bag) {
  const pumped = serverDate(bag.pumped_at) || new Date();
  if (bag.place === 'thawed') {
    const thawed = serverDate(bag.thawed_at) || pumped;
    return { useBy: new Date(thawed.getTime() + DAY) };
  }
  if (bag.place === 'freezer') return { useBy: addMonths(pumped, 12), bestBy: addMonths(pumped, 6) };
  return { useBy: new Date(pumped.getTime() + 4 * DAY) };
}

/** 'gone' (past its use-by), 'soon' (within a day, or a freezer bag past its best date), or 'ok'. */
export function stateOf(bag, now = new Date()) {
  const { useBy, bestBy } = datesOf(bag);
  if (useBy <= now) return 'gone';
  if (useBy.getTime() - now.getTime() <= DAY) return 'soon';
  if (bestBy && bestBy <= now) return 'soon';
  return 'ok';
}

/**
 * Oldest first, the way to use a stash: thawed milk (it has the least time),
 * then the fridge, then the freezer; inside each, the soonest use-by first.
 */
export function inOrder(bags) {
  const rank = { thawed: 0, fridge: 1, freezer: 2 };
  return [...bags].sort((a, b) => (rank[a.place] ?? 3) - (rank[b.place] ?? 3) || datesOf(a).useBy - datesOf(b).useBy);
}

/** The bag to use next: the first one that's still good. */
export const nextToUse = (bags, now = new Date()) => inOrder(bags).find((b) => stateOf(b, now) !== 'gone') || null;

export const ozText = (n) => `${Math.round((Number(n) || 0) * 10) / 10} oz`;

export async function addBag({ person, amount, place, pumpedAt, notes, me, pumpingLogId }) {
  return base44.entities.MilkStash.create(withFamily({
    family_member_id: person.id,
    family_member_name: person.name,
    amount: Number(amount),
    place,
    pumped_at: new Date(pumpedAt || Date.now()).toISOString(),
    ...(place === 'thawed' ? { thawed_at: new Date().toISOString() } : {}),
    status: 'in',
    ...(notes ? { notes } : {}),
    ...(pumpingLogId ? { pumping_log_id: pumpingLogId } : {}),
    added_by_user_id: me?.id,
    added_by_name: me?.display_name || me?.full_name || '',
  }));
}

export const moveBag = (bag, place) => base44.entities.MilkStash.update(bag.id, {
  place,
  ...(place === 'thawed' ? { thawed_at: new Date().toISOString() } : {}),
});

export const finishBag = (bag, status, feedingLogId) => base44.entities.MilkStash.update(bag.id, {
  status,
  done_at: new Date().toISOString(),
  ...(feedingLogId ? { feeding_log_id: feedingLogId } : {}),
});

export const restoreBag = (bag) => base44.entities.MilkStash.update(bag.id, { status: 'in', done_at: null, feeding_log_id: null });

export const deleteBag = (bag) => base44.entities.MilkStash.delete(bag.id);

/**
 * Ounces of bottles a day, from the last 7 days of bottle feedings that have
 * an amount (null with fewer than 3 of them), for "about N days of bottles".
 */
export function bottlesPerDay(logs, now = new Date()) {
  const since = now.getTime() - 7 * DAY;
  const feeds = logs.filter((l) => l.entry_type === 'feeding' && l.sub_type === 'bottle' && Number(l.amount) > 0 && (serverDate(l.timestamp)?.getTime() || 0) >= since);
  if (feeds.length < 3) return null;
  const days = new Set(feeds.map((l) => serverDate(l.timestamp).toDateString())).size;
  return feeds.reduce((a, l) => a + Number(l.amount), 0) / Math.max(1, days);
}

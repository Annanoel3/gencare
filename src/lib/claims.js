import { base44 } from '@/api/base44Client';

// "I'll take it" (Anna, Oct 30 2026): someone in the family says they'll
// handle an event or a reminder, everyone sees who's on it, and its
// reminders go to them. Stored on the row (claims: [{ day, user_id, name,
// at }]); the server function claimItem does the taking and letting go and
// tells whoever added it. Twin of base44/shared/claims.ts.
//
// `day` is the date for something that repeats (taking this Tuesday's PT
// isn't taking every Tuesday) and '' for a one-off event or an "until it's
// done" / "one time" reminder, where the claim covers the whole thing.

const ONE_OFF_REMINDERS = ['Once', 'One time'];

export function claimDayFor(kind, item, date) {
  if (kind === 'event') return item?.recurrence ? String(date || '') : '';
  return ONE_OFF_REMINDERS.includes(item?.frequency) ? '' : String(date || '');
}

export function claimsOf(item) {
  return (Array.isArray(item?.claims) ? item.claims : []).filter((c) => c && c.user_id);
}

/**
 * Who has it on that day, or null. `accounts` (the family's accounts, from
 * useFamily) drops a claim by someone who has left the family.
 */
export function claimOn(item, day, accounts) {
  const c = claimsOf(item).find((x) => String(x.day || '') === String(day || '')) || null;
  if (c && Array.isArray(accounts) && accounts.length && !accounts.some((a) => a.id === c.user_id)) return null;
  return c;
}

/** Claims from every copy of the same event, one per day (the earliest). */
export function mergeClaims(rows) {
  const byDay = new Map();
  for (const r of rows) {
    for (const c of claimsOf(r)) {
      const k = String(c.day || '');
      const had = byDay.get(k);
      if (!had || String(c.at || '') < String(had.at || '')) byDay.set(k, c);
    }
  }
  return [...byDay.values()];
}

/** An event row as shown (merged, maybe an occurrence): where its claim goes. */
export function eventClaimTarget(appt) {
  const rowId = appt?.occurrence_of || appt?.id;
  // Their own private event shown as the family's stand-in: the stand-in is
  // what the family sees, so that's where the claim goes.
  const id = appt?.cover_id || rowId;
  const ids = [...new Set([rowId, ...(Array.isArray(appt?.merged_ids) ? appt.merged_ids : [])].filter(Boolean))];
  return { id, ids };
}

/** Can this be taken at all? Nothing private ("just me") is. */
export function canClaim(kind, item) {
  if (!item) return false;
  if (item.visibility === 'private') return false;
  if (kind === 'event' && item.away_of) return false; // "<name> traveling"
  return true;
}

export async function setClaim({ kind, item, date, take }) {
  const body = kind === 'event'
    ? { kind, ...eventClaimTarget(item), date, action: take ? 'take' : 'release' }
    : { kind, id: item.id, date, action: take ? 'take' : 'release' };
  const res = await base44.functions.invoke('claimItem', body).catch((e) => {
    const data = e?.response?.data || e?.data;
    if (data) return { data };
    throw e;
  });
  const out = res?.data ?? res;
  if (!out?.ok) {
    const err = new Error(out?.error === 'taken' ? `${firstName(out?.claim?.name) || 'Someone'} already took it`
      : out?.error === 'not_yours' ? `${firstName(out?.claim?.name) || 'Someone else'} has it`
      : out?.error === 'private' ? 'Only you see this one'
      : out?.error || "Couldn't save");
    err.code = out?.error;
    throw err;
  }
  return out;
}

export const firstName = (s) => String(s || '').trim().split(' ')[0];

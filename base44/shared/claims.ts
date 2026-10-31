// "I'll take it" (Anna, Oct 30 2026): someone in the family says they'll
// handle an event or a reminder. Kept on the row itself:
//
//   claims: [{ day, user_id, name, at }]
//
// `day` is the date (YYYY-MM-DD) for something that repeats, so taking this
// Tuesday's PT doesn't take every Tuesday; it's '' for a one-off event and
// for "until it's done" / "one time" reminders, where the claim is the whole
// thing. Twin of src/lib/claims.js; change both together.

export type Claim = { day: string; user_id: string; name: string; at: string };

const ONE_OFF_REMINDERS = ['Once', 'One time'];

/** The day key a claim on this item uses for the given date. */
export function claimDayFor(kind: 'event' | 'reminder', item: any, date: string): string {
  if (kind === 'event') return item?.recurrence ? String(date || '') : '';
  return ONE_OFF_REMINDERS.includes(item?.frequency) ? '' : String(date || '');
}

export function claimsOf(item: any): Claim[] {
  return (Array.isArray(item?.claims) ? item.claims : []).filter((c: any) => c && c.user_id);
}

/** Who has it on that day (day key from claimDayFor), or null. */
export function claimOn(item: any, day: string): Claim | null {
  return claimsOf(item).find((c) => String(c.day || '') === String(day || '')) || null;
}

/** Old per-day claims fall off after two weeks; whole-thing claims stay. */
export function pruneClaims(list: Claim[], today: string): Claim[] {
  const [y, m, d] = today.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) - 14)).toISOString().slice(0, 10);
  return list.filter((c) => !c.day || c.day >= cutoff);
}

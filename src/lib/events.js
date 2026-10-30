import { base44 } from '@/api/base44Client';
import { format, addDays } from 'date-fns';
import { mergeSameEvents } from '@/lib/sameEvent';

// Loading events for a stretch of days. Pages used to ask for "the 50 (or
// 1000) events furthest in the future", so once a phone calendar brought in a
// year of events, this week's fell off the end and the home page, the feed and
// Tasks showed nothing. Now each page asks for the days it shows.

const ymd = (d) => format(d, 'yyyy-MM-dd');

/**
 * Every event that can land between `from` and `to` (Dates, inclusive): the
 * ones dated in that stretch, plus repeating and multi-day ones that started
 * earlier. Hand the result to expandAppointments for one entry per day.
 * The same event on two people's calendars comes back once (lib/sameEvent).
 */
export async function listEvents(from, to) {
  const E = base44.entities.Appointment;
  const a = ymd(from);
  const b = ymd(to);
  try {
    const [dated, series, spans] = await Promise.all([
      E.filter({ date: { $gte: a, $lte: b } }, 'date', 3000),
      E.filter({ recurrence: { $regex: 'FREQ=' }, date: { $lt: a } }, '-date', 1000),
      E.filter({ date: { $lt: a }, end_date: { $gte: a } }, '-date', 500),
    ]);
    const byId = new Map();
    for (const r of [...(dated || []), ...(series || []), ...(spans || [])]) if (r?.id) byId.set(r.id, r);
    return mergeSameEvents([...byId.values()]);
  } catch (e) {
    console.warn('[events] could not load by date, loading the latest instead', e);
    return mergeSameEvents((await E.list('-date', 2000)) || []);
  }
}

// Last month through next month: what the home page, the feed and Tasks show.
// The day is in the key so a page left open overnight asks again.
export const aroundKey = () => ['appointments', 'around', ymd(new Date())];
export const listEventsAround = () => listEvents(addDays(new Date(), -31), addDays(new Date(), 31));

// ── Sorting a new event ─────────────────────────────────────────────────────
// The person's "Who sees the events you add" choice: 'auto' (GenCare decides),
// 'family' (everyone) or 'private' (just them). '' = not chosen yet.
export function sharingDefaultOf(me) {
  const v = me?.event_sharing_default;
  return v === 'auto' || v === 'family' || v === 'private' ? v : '';
}

// What a new event starts as before it's sorted. "GenCare decides" starts at
// Only me, so nothing personal is ever shown while the decision is pending.
export function startingVisibility(mode) {
  return mode === 'family' || mode === '' ? 'family' : 'private';
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * After a new event is saved: GenCare fills in what the person left alone —
 * who it's about, its category and (with "GenCare decides") whether the family
 * sees it. `left` = { visibility, member, category }: true for each one the
 * person didn't pick. Returns { patch, becameShared, memberName, shared } or
 * null when there was nothing to do or the sorting failed (then the event
 * just stays as saved).
 */
export async function sortNewEvent(created, left = {}, mode = '') {
  if (!created?.id || !created.title) return null;
  const wantShare = !!left.visibility && mode === 'auto';
  if (!wantShare && !left.member && !left.category) return null;
  let r = null;
  try {
    const res = await withTimeout(base44.functions.invoke('phoneCalendar', {
      mode: 'sort',
      event: { title: created.title, notes: created.notes, location: created.location, with: created.doctor_name, date: created.date, time: created.time },
    }), 20000);
    r = res?.data || res;
  } catch (e) { r = null; }
  if (!r?.ok) return null;
  const auto = new Set(Array.isArray(created.auto_set) ? created.auto_set : []);
  const patch = { ai_checked_at: new Date().toISOString(), ai_share: !!r.share, ai_trip: !!r.trip, ai_cover: r.cover || '', ...(typeof r.care === 'boolean' ? { ai_care: r.care } : {}) };
  if (left.member && r.member_id) { patch.family_member_id = r.member_id; patch.family_member_name = r.member_name || ''; auto.add('member'); }
  if (left.category && r.category && r.category !== created.category) { patch.category = r.category; auto.add('category'); }
  let becameShared = false;
  if (wantShare) {
    patch.visibility = r.share ? 'family' : 'private';
    patch.shared_with = [];
    becameShared = r.share && created.visibility === 'private';
    auto.add('visibility');
  }
  patch.auto_set = [...auto];
  await base44.entities.Appointment.update(created.id, patch);
  // Part of a trip, or a private appointment the family still sees as
  // "<name>: doctor": the family's stand-in follows.
  if (r.trip || r.cover) await base44.functions.invoke('phoneCalendar', { mode: 'away' }).catch(() => {});
  return { patch, becameShared, shared: wantShare ? !!r.share : null, memberName: patch.family_member_name || '' };
}

/** One line telling the person what GenCare picked (for a toast). */
export function sortedLine(result) {
  if (!result) return '';
  const parts = [];
  if (result.shared === true) parts.push('Shared with the whole family');
  if (result.shared === false) parts.push('Kept just for you');
  if (result.memberName) parts.push(`for ${result.memberName.split(' ')[0]}`);
  return parts.length ? `${parts.join(', ')}. Tap the event to change it.` : '';
}

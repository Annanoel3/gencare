import { base44 } from '@/api/base44Client';
import { format, addDays } from 'date-fns';

// Loading events for a stretch of days. Pages used to ask for "the 50 (or
// 1000) events furthest in the future", so once a phone calendar brought in a
// year of events, this week's fell off the end and the home page, the feed and
// Tasks showed nothing. Now each page asks for the days it shows.

const ymd = (d) => format(d, 'yyyy-MM-dd');

/**
 * Every event that can land between `from` and `to` (Dates, inclusive): the
 * ones dated in that stretch, plus repeating and multi-day ones that started
 * earlier. Hand the result to expandAppointments for one entry per day.
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
    return [...byId.values()];
  } catch (e) {
    console.warn('[events] could not load by date, loading the latest instead', e);
    return (await E.list('-date', 2000)) || [];
  }
}

// Last month through next month: what the home page, the feed and Tasks show.
// The day is in the key so a page left open overnight asks again.
export const aroundKey = () => ['appointments', 'around', ymd(new Date())];
export const listEventsAround = () => listEvents(addDays(new Date(), -31), addDays(new Date(), 31));

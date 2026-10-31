import { base44 } from '@/api/base44Client';

// What an event looked like before someone started changing it, so the push
// to the family can say what changed (Anna, Oct 31 2026: "it doesn't show
// what was changed"). Read from the database the first time an edit saves
// (what's on screen can be the merged copy of two calendars), and sent with
// notifyFamily "changed", which compares it with the saved event and writes
// the words itself.

export const BEFORE_FIELDS = ['title', 'date', 'time', 'end_time', 'end_date', 'all_day', 'location', 'notes', 'family_member_name', 'recurrence'];

export async function snapshotEvent(id) {
  try {
    const row = (await base44.entities.Appointment.filter({ id }))?.[0];
    if (!row) return null;
    return Object.fromEntries(BEFORE_FIELDS.map((k) => [k, row[k] ?? (k === 'all_day' ? false : '')]));
  } catch (e) {
    return null;
  }
}

export function notifyEvent(action, id, before) {
  return base44.functions.invoke('notifyFamily', { kind: 'appointment', action, appointment_id: id, ...(before ? { before } : {}) }).catch(() => {});
}

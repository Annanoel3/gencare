import { format } from 'date-fns';
import { rowIdOf } from '@/lib/occurrences';

// One visit of an appointment, for Record Notes. A repeating appointment
// (weekly therapy, say) is one event row, so its notes are told apart by day:
// the link carries the day (?on=YYYY-MM-DD) and a recording belongs to the
// day it was started. Before Nov 16 2026 the first week's notes opened every
// week after, so a repeating appointment could only be recorded once.

export const dayOf = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
};

/** The Record Notes page for this visit; `record` starts recording right away. */
export function notesLink(appt, { record = false } = {}) {
  const q = new URLSearchParams({ appointment: rowIdOf(appt) });
  if (appt?.occurrence_of && appt.date) q.set('on', appt.date);
  if (record) q.set('record', '1');
  return `/notes?${q}`;
}

/** Recording `r` is the notes from this visit (on `day`, when it repeats). */
export const isNotesOf = (r, appt, day) =>
  !!r && !r.parent_record_id && r.appointment_id === rowIdOf(appt) && (!appt?.recurrence || dayOf(r.started_at) === day);

/** Whether an event's record link should say "Notes" (it has some) or "Record". */
export function showsNotes(appt, today = format(new Date(), 'yyyy-MM-dd')) {
  // One row for every week: the saved link is the latest week's, so a day
  // that's gone by says Notes and today or later says Record.
  if (appt?.recurrence) return !!appt.occurrence_of && String(appt.date || '') < today;
  return !!appt?.notes_record_id;
}

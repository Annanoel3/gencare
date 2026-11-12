import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// Events added together from one photo share an import_id (Anna, Nov 12
// 2026: the therapy place changed the schedule and she was "stuck with a bunch
// of different events that I need to cancel and then re-put in. Is there like
// an easy undo button"). With it the whole lot can come off the calendar
// together, and a new photo of the schedule can replace the old one.

export const newImportId = () => `photo-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 6)}`;

/** Everything from one photo that this person can see, soonest first. */
export async function photoBatch(importId) {
  if (!importId) return [];
  const rows = (await base44.entities.Appointment.filter({ import_id: importId }, 'date', 200)) || [];
  return rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')));
}

/**
 * Takes events off the calendar: the family hears once ("Anna took off 8
 * events"), unless `tell` is false (a new schedule's own push says it), then
 * they're deleted a few at a time. Returns how many are gone.
 */
export async function takeOff(rows, { tell = true } = {}) {
  const list = (rows || []).filter((r) => r?.id);
  if (!list.length) return 0;
  // The server checks who can see each one as it is now (a photo's events
  // can be shared after they were saved).
  if (tell) {
    await base44.functions.invoke('notifyFamily', { kind: 'appointments', action: 'removed', appointment_ids: list.map((r) => r.id) }).catch(() => {});
  }
  let gone = 0;
  for (let i = 0; i < list.length; i += 6) {
    const done = await Promise.all(list.slice(i, i + 6).map((r) => base44.entities.Appointment.delete(r.id).then(() => true, () => false)));
    gone += done.filter(Boolean).length;
  }
  return gone;
}

// What a saved row is (its own fields only, not what the database or the
// calendar's display adds), to put a taken-off event back with Undo. Whether
// its reminder went out starts fresh.
const FIELDS = ["ai_care", "ai_checked_at", "ai_cover", "ai_share", "ai_sort_v", "ai_trip", "all_day", "auto_set", "away_of", "care", "category", "checks", "claims", "cover_of", "created_by_name", "created_by_user_id", "date", "device_key", "doctor_name", "end_date", "end_time", "family_id", "family_member_id", "family_member_name", "import_id", "last_changed_at", "location", "notes", "notes_record_id", "phone_location", "phone_notes", "prep_questions", "recurrence", "reminder_minutes", "shared_with", "source", "time", "timezone", "title", "visibility"];
export async function putBack(rows) {
  for (const r of rows || []) {
    const data = Object.fromEntries(FIELDS.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => [k, r[k]]));
    await base44.entities.Appointment.create(withFamily(data)).catch(() => null);
  }
}

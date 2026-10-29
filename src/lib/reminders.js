import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { format } from 'date-fns';

// Reminders: things the family does at set times (feed the dog, water the
// plants, a daily call, a pill). A "slot" is a reminder × one of its times on
// one day. The reminder job writes a log row ('due') at the time; the Done
// button writes or flips that row. Marking one done from the app before the
// job got there makes the row itself.
//
// Storage note: these live in the Medication / MedicationLog tables (the page
// started out as a medication list). Only the table names are left from that;
// the fields used are what/details/for/times/days/notes/runs-out date, and a
// log's 'taken' status means done.

export const REMINDERS_KEY = ['reminders'];
export const listReminders = () => base44.entities.Medication.list('-created_date', 200);

export const FREQUENCIES = ['Once', 'Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Weekly', 'Bi-weekly', 'Monthly', 'As needed'];
export const FREQUENCY_LABELS = {
  Once: "Until it's done", 'Once daily': 'Once a day', 'Twice daily': 'Twice a day', 'Three times daily': '3 times a day', 'Four times daily': '4 times a day',
  Weekly: 'Weekly', 'Bi-weekly': 'Every 2 weeks', Monthly: 'Monthly', 'As needed': 'No set time',
};
export const frequencyLabel = (f) => FREQUENCY_LABELS[f] || f || '';
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Suggested times for a frequency, used when the person hasn't set any. */
export function defaultTimes(frequency) {
  switch (frequency) {
    case 'Twice daily': return ['08:00', '20:00'];
    case 'Three times daily': return ['08:00', '14:00', '20:00'];
    case 'Four times daily': return ['08:00', '12:00', '16:00', '20:00'];
    case 'As needed': return [];
    case 'Once': { const h = Math.min(new Date().getHours() + 1, 23); return [`${String(h).padStart(2, '0')}:00`]; }
    default: return ['08:00'];
  }
}

export const todayStr = () => format(new Date(), 'yyyy-MM-dd');

export function fmtClock(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return t || '';
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

/** Today's slots across active reminders, with their log (if any). */
export function slotsForDay(meds, logs, day = todayStr()) {
  const dow = new Date(day + 'T12:00:00').getDay();
  const out = [];
  for (const m of meds) {
    if (m.is_active === false) continue;
    // "Until it's done": every day from its start day until someone marks it done.
    if (m.frequency === 'Once') { if (!m.once_date || m.once_date > day) continue; } else {
      const days = Array.isArray(m.days_of_week) ? m.days_of_week : [];
      if (days.length && !days.includes(dow)) continue;
    }
    for (const t of (Array.isArray(m.times) ? m.times : [])) {
      const log = logs.find((l) => l.medication_id === m.id && l.day === day && l.time === t) || null;
      out.push({ key: `${m.id}@${t}`, med: m, time: t, day, log, status: log?.status || 'upcoming' });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Mark a slot done ('taken') / skipped / back to due. */
export async function markSlot(slot, status, me) {
  const base = {
    medication_id: slot.med.id, medication_name: slot.med.medication_name,
    family_member_id: slot.med.family_member_id, family_member_name: slot.med.family_member_name,
    day: slot.day, time: slot.time,
    // A "just me" reminder's log is just as private as the reminder.
    visibility: slot.med.visibility === 'private' ? 'private' : 'family',
    owner_user_id: slot.med.owner_user_id || slot.med.created_by_id || '',
  };
  const patch = status === 'taken' || status === 'skipped'
    ? { status, taken_at: new Date().toISOString(), taken_by_user_id: me?.id, taken_by_name: me?.display_name || me?.full_name }
    : { status: 'due', taken_at: null, taken_by_user_id: null, taken_by_name: null };
  const saved = slot.log?.id
    ? await base44.entities.MedicationLog.update(slot.log.id, patch)
    : await base44.entities.MedicationLog.create(withFamily({ ...base, ...patch }));
  // An "until it's done" reminder ends when someone marks it done (Undo brings
  // it back). Skip only skips today; it comes back tomorrow.
  if (slot.med.frequency === 'Once' && (status === 'taken' || status === 'due')) {
    const active = status !== 'taken';
    if ((slot.med.is_active !== false) !== active) await base44.entities.Medication.update(slot.med.id, { is_active: active });
  }
  return saved;
}

export function cleanMed(form, members, me) {
  const member = members.find((m) => m.id === form.family_member_id);
  const times = (form.times || []).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  const once = form.frequency === 'Once';
  const data = {
    medication_name: form.medication_name.trim(),
    dosage: form.dosage || '',
    frequency: form.frequency,
    family_member_id: form.family_member_id,
    family_member_name: member?.name || form.family_member_name || '',
    notes: (form.notes || '').trim(),
    times,
    days_of_week: !once && Array.isArray(form.days_of_week) ? form.days_of_week : [],
    once_date: once ? (form.once_date || todayStr()) : null,
    // Everyone in the family, or only the person who added it ("Just me").
    visibility: form.visibility === 'private' ? 'private' : 'family',
    // Whoever makes it "Just me" is the one who keeps it.
    owner_user_id: (form.visibility === 'private' ? me?.id || form.owner_user_id : form.owner_user_id || me?.id) || '',
    remind: form.remind !== false,
    refill_reminder_days: Number(form.refill_reminder_days ?? 3),
    is_active: form.is_active !== false,
  };
  if (form.refill_date && !once) data.refill_date = form.refill_date; else data.refill_date = null;
  if (form.start_date) data.start_date = form.start_date; else data.start_date = null;
  return data;
}

/** An "until it's done" reminder that someone finished (kept for its history, not listed). */
export const isFinishedOnce = (m) => m?.frequency === 'Once' && m.is_active === false;
export const isPrivate = (m) => m?.visibility === 'private';

/** Done / total over the last `days` days for one reminder. */
export function adherence(med, logs, days = 14) {
  const since = format(new Date(Date.now() - days * 86400000), 'yyyy-MM-dd');
  const mine = logs.filter((l) => l.medication_id === med.id && l.day >= since && l.status !== 'due');
  const taken = mine.filter((l) => l.status === 'taken').length;
  const missed = mine.filter((l) => l.status === 'missed').length;
  return { taken, missed, skipped: mine.length - taken - missed, total: mine.length };
}

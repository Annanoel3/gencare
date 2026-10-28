import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { format } from 'date-fns';

// Medications and doses. A dose "slot" is a medication × one of its times on
// one day. The reminder job writes a MedicationLog row ('due') at the time;
// the Taken button writes or flips that row. Marking a dose from the app
// before the job got there makes the row itself.

export const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Weekly', 'Bi-weekly', 'Monthly', 'As needed'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Suggested dose times for a frequency, used when the person hasn't set any. */
export function defaultTimes(frequency) {
  switch (frequency) {
    case 'Twice daily': return ['08:00', '20:00'];
    case 'Three times daily': return ['08:00', '14:00', '20:00'];
    case 'Four times daily': return ['08:00', '12:00', '16:00', '20:00'];
    case 'As needed': return [];
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

/** Today's dose slots across active medications, with their log (if any). */
export function slotsForDay(meds, logs, day = todayStr()) {
  const dow = new Date(day + 'T12:00:00').getDay();
  const out = [];
  for (const m of meds) {
    if (m.is_active === false) continue;
    const days = Array.isArray(m.days_of_week) ? m.days_of_week : [];
    if (days.length && !days.includes(dow)) continue;
    for (const t of (Array.isArray(m.times) ? m.times : [])) {
      const log = logs.find((l) => l.medication_id === m.id && l.day === day && l.time === t) || null;
      out.push({ key: `${m.id}@${t}`, med: m, time: t, day, log, status: log?.status || 'upcoming' });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Mark a slot taken / skipped / back to due. */
export async function markDose(slot, status, me) {
  const base = {
    medication_id: slot.med.id, medication_name: slot.med.medication_name,
    family_member_id: slot.med.family_member_id, family_member_name: slot.med.family_member_name,
    day: slot.day, time: slot.time,
  };
  const patch = status === 'taken' || status === 'skipped'
    ? { status, taken_at: new Date().toISOString(), taken_by_user_id: me?.id, taken_by_name: me?.display_name || me?.full_name }
    : { status: 'due', taken_at: null, taken_by_user_id: null, taken_by_name: null };
  if (slot.log?.id) return base44.entities.MedicationLog.update(slot.log.id, patch);
  return base44.entities.MedicationLog.create(withFamily({ ...base, ...patch }));
}

export function cleanMed(form, members) {
  const member = members.find((m) => m.id === form.family_member_id);
  const times = (form.times || []).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  const data = {
    medication_name: form.medication_name.trim(),
    dosage: form.dosage || '',
    frequency: form.frequency,
    family_member_id: form.family_member_id,
    family_member_name: member?.name || form.family_member_name || '',
    instructions: form.instructions || '',
    prescribing_doctor: form.prescribing_doctor || '',
    pharmacy: form.pharmacy || '',
    notes: form.notes || '',
    times,
    days_of_week: Array.isArray(form.days_of_week) ? form.days_of_week : [],
    remind: form.remind !== false,
    refill_reminder_days: Number(form.refill_reminder_days ?? 3),
    is_active: form.is_active !== false,
  };
  if (form.refill_date) data.refill_date = form.refill_date; else data.refill_date = null;
  if (form.start_date) data.start_date = form.start_date; else data.start_date = null;
  return data;
}

/** Taken / total over the last `days` days for one medication. */
export function adherence(med, logs, days = 14) {
  const since = format(new Date(Date.now() - days * 86400000), 'yyyy-MM-dd');
  const mine = logs.filter((l) => l.medication_id === med.id && l.day >= since && l.status !== 'due');
  const taken = mine.filter((l) => l.status === 'taken').length;
  const missed = mine.filter((l) => l.status === 'missed').length;
  return { taken, missed, skipped: mine.length - taken - missed, total: mine.length };
}

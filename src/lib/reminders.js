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

export const FREQUENCIES = ['Once', 'One time', 'Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Weekly', 'Bi-weekly', 'Monthly', 'As needed'];
export const FREQUENCY_LABELS = {
  Once: "Until it's done", 'One time': 'One time', 'Once daily': 'Once a day', 'Twice daily': 'Twice a day', 'Three times daily': '3 times a day', 'Four times daily': '4 times a day',
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
// Two kinds of one-off reminder (Anna, Oct 29 2026: "either or"):
//   'One time'  — "remind me at 12": one push at that time on that day, and that's all.
//   'Once'      — "until it's done": it keeps reminding until someone marks it
//                 done, as often as its priority says. No time to pick; it
//                 starts at the next full hour and works out the rest.
export const ONE_TIME = 'One time';
export const PRIORITIES = [['low', 'Low', 'once a day'], ['medium', 'Medium', '3 times a day'], ['high', 'High', 'every 2 hours']];
const DAY_START = 8 * 60; // nagging pushes stay between 8 AM
const DAY_END = 20 * 60; //  and 8 PM, so nobody gets them at night
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toT = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** An "until it's done" reminder's push times: low 1 a day, medium 3, high every 2 hours (8 AM to 8 PM). */
export function nagTimes(anchor, priority = 'medium') {
  let a = /^\d{2}:\d{2}$/.test(anchor || '') ? toMin(anchor) : DAY_START + 120;
  if (a < DAY_START || a > DAY_END) a = DAY_START; // started at night: it begins at 8 AM
  if (priority === 'low') return [toT(a)];
  const step = priority === 'high' ? 120 : 240;
  const grid = [];
  for (let m = a % step; m < 24 * 60; m += step) if (m >= DAY_START && m <= DAY_END) grid.push(m);
  let pick = grid;
  if (priority !== 'high') {
    const later = grid.filter((m) => m >= a);
    const earlier = grid.filter((m) => m < a).reverse();
    pick = later.slice(0, 3);
    for (const m of earlier) { if (pick.length >= 3) break; pick.push(m); }
  }
  return [...new Set([...pick, a].map(toT))].sort();
}
/**
 * Where an "until it's done" reminder starts: at its time, kept inside 8 AM to
 * 8 PM. One added late in the evening starts at 8 the next morning.
 */
export function nagStart(anchor, day = todayStr()) {
  const a = /^\d{2}:\d{2}$/.test(anchor || '') ? toMin(anchor) : DAY_START + 120;
  if (a > DAY_END && day === todayStr()) return { anchor: toT(DAY_START), day: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd') };
  if (a > DAY_END || a < DAY_START) return { anchor: toT(DAY_START), day };
  return { anchor: toT(a), day };
}
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function slotsForDay(meds, logs, day = todayStr()) {
  const dow = new Date(day + 'T12:00:00').getDay();
  const out = [];
  for (const m of meds) {
    if (m.is_active === false) continue;
    // "Until it's done": every day from its start day until someone marks it done.
    if (m.frequency === ONE_TIME) { if (m.once_date !== day) continue; } else if (m.frequency === 'Once') { if (!m.once_date || m.once_date > day) continue; } else {
      const days = Array.isArray(m.days_of_week) ? m.days_of_week : [];
      if (days.length && !days.includes(dow)) continue;
    }
    const mine = [];
    let ts = Array.isArray(m.times) ? m.times : [];
    // Its first day starts when it was set to start, not earlier that morning.
    if (m.frequency === 'Once' && m.once_date === day && m.anchor_time && ts.some((t) => t >= m.anchor_time)) ts = ts.filter((t) => t >= m.anchor_time);
    for (const t of ts) {
      const log = logs.find((l) => l.medication_id === m.id && l.day === day && l.time === t) || null;
      mine.push({ key: `${m.id}@${t}`, med: m, time: t, day, log, status: log?.status || 'upcoming' });
    }
    // An "until it's done" reminder that nags several times a day is still
    // one thing to do: one card (the latest push so far, or the first one).
    if (m.frequency === 'Once' && mine.length > 1) {
      const by = day === todayStr() ? nowHHMM() : day < todayStr() ? '23:59' : '00:00';
      const pick = mine.find((x) => x.status === 'taken' || x.status === 'skipped') || [...mine].reverse().find((x) => x.time <= by) || mine[0];
      out.push({ ...pick, nags: mine.map((x) => x.time) });
    } else out.push(...mine);
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
  const oneTime = form.frequency === ONE_TIME;
  const data = {
    medication_name: form.medication_name.trim(),
    dosage: form.dosage || '',
    frequency: form.frequency,
    family_member_id: form.family_member_id,
    family_member_name: member?.name || form.family_member_name || '',
    notes: (form.notes || '').trim(),
    times: oneTime ? times.slice(0, 1) : times,
    days_of_week: !once && !oneTime && Array.isArray(form.days_of_week) ? form.days_of_week : [],
    once_date: once || oneTime ? (form.once_date || todayStr()) : null,
    // Everyone in the family, or only the person who added it ("Just me").
    visibility: form.visibility === 'private' ? 'private' : 'family',
    // Whoever makes it "Just me" is the one who keeps it.
    owner_user_id: (form.visibility === 'private' ? me?.id || form.owner_user_id : form.owner_user_id || me?.id) || '',
    remind: form.remind !== false,
    refill_reminder_days: Number(form.refill_reminder_days ?? 3),
    is_active: form.is_active !== false,
  };
  // "Until it's done": its pushes come from when it starts and its priority.
  if (once) {
    data.priority = ['low', 'medium', 'high'].includes(form.priority) ? form.priority : 'medium';
    const start = nagStart(/^\d{2}:\d{2}$/.test(form.anchor_time || '') ? form.anchor_time : (times[0] || defaultTimes('Once')[0]), data.once_date);
    data.anchor_time = start.anchor;
    data.once_date = start.day;
    data.times = nagTimes(start.anchor, data.priority);
  }
  if (form.refill_date && !once && !oneTime) data.refill_date = form.refill_date; else data.refill_date = null;
  if (form.start_date) data.start_date = form.start_date; else data.start_date = null;
  return data;
}

/** An "until it's done" reminder that someone finished (kept for its history, not listed). */
export const isFinishedOnce = (m) => (m?.frequency === 'Once' && m.is_active === false) || (m?.frequency === ONE_TIME && !!m.once_date && m.once_date < todayStr());
export const isPrivate = (m) => m?.visibility === 'private';

/** Done / total over the last `days` days for one reminder. */
export function adherence(med, logs, days = 14) {
  const since = format(new Date(Date.now() - days * 86400000), 'yyyy-MM-dd');
  const mine = logs.filter((l) => l.medication_id === med.id && l.day >= since && l.status !== 'due');
  const taken = mine.filter((l) => l.status === 'taken').length;
  const missed = mine.filter((l) => l.status === 'missed').length;
  return { taken, missed, skipped: mine.length - taken - missed, total: mine.length };
}

import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { format, addDays } from 'date-fns';

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
// How hard an "until it's done" to-do keeps after people: Low reminds once a
// day, Medium about 3 times, High every 2 hours (untilTimes). The buttons say
// only Low / Medium / High; the form spells out the times under them.
export const PRIORITIES = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
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
 * An "until it's done" to-do's push times when someone picked its time (Anna,
 * Nov 19 2026: "pick up dry cleaning from 3-5 p.m."): the time they picked,
 * then its priority's usual pushes. With an end time, only inside the range,
 * plus a last nudge 30 minutes before it ends (not for Low, once a day); not
 * done by then, it comes back the next day in the same range.
 */
export function untilTimes(start, priority = 'medium', end = '') {
  const ok = (t) => /^\d{2}:\d{2}$/.test(t || '');
  if (!ok(start)) return nagTimes(start, priority);
  // Low is once a day: at the time picked.
  if (priority === 'low') return [start];
  const usual = nagTimes(start, priority);
  if (!ok(end) || end <= start) return [...new Set([start, ...usual])].sort();
  const a = toMin(start), e = toMin(end);
  const out = new Set([start, ...usual.filter((t) => toMin(t) > a && toMin(t) < e)]);
  if (priority !== 'low' && e - 30 >= a + 30) out.add(toT(e - 30));
  return [...out].sort();
}

/** "3:00 PM – 5:00 PM" (how events show theirs), or just the start. */
export const fmtRange = (start, end) => (start ? `${fmtClock(start)}${end && end > start ? ` – ${fmtClock(end)}` : ''}` : '');
/** A to-do's end time, while it's after its start. */
export const endOf = (m) => {
  const start = m?.frequency === 'Once' ? m.anchor_time : (Array.isArray(m?.times) ? m.times[0] : '');
  return /^\d{2}:\d{2}$/.test(m?.end_time || '') && start && m.end_time > start ? m.end_time : '';
};

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
    // Finished (done or skipped): gone, except on the day it was finished, where it shows with Undo.
    if (m.is_active === false && !(m.frequency === 'Once' && logs.some((l) => l.medication_id === m.id && l.day === day && (l.status === 'taken' || l.status === 'skipped')))) continue;
    // "Until it's done": every day from its start day until someone marks it done.
    if (m.frequency === ONE_TIME) { if (m.once_date !== day) continue; } else if (m.frequency === 'Once') { if (!m.once_date || m.once_date > day) continue; } else {
      if (m.end_date && day > m.end_date) continue; // past its last day
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
    // An "until it's done" reminder is one thing to do: one card (the latest
    // push so far, or the first one), shown as "until it's done" even with one
    // push a day (Low), not as a missed time.
    if (m.frequency === 'Once' && mine.length) {
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
  // An "until it's done" reminder ends when someone marks it done or skips it
  // (Anna, Nov 19 2026: "Each time i press skip, it stays on other days"); it
  // stays on that day's list, greyed, with Undo, which brings it back.
  if (slot.med.frequency === 'Once' && (status === 'taken' || status === 'skipped' || status === 'due')) {
    const active = status === 'due';
    if ((slot.med.is_active !== false) !== active) await base44.entities.Medication.update(slot.med.id, { is_active: active });
  }
  return saved;
}

// Steps, like a checklist inside a reminder (Anna, Nov 14 2026: "add a way to
// have a checklist in a reminder? Kind of the same way adhdone has subtasks").
// steps: the step names. steps_done: ticked ones as "slot|step", where slot is
// "all" for an "until it's done" reminder (its ticks last until it's done) or
// "YYYY-MM-DD@HH:MM" for one time it comes around (fresh each time). Anyone in
// the family can tick; ticking the last step marks it done. Ticks are saved on
// the reminder, not the day's log row, so the reminder job's "due" push still
// goes out for a slot someone started early.
export const stepsOf = (m) => [...new Set((Array.isArray(m?.steps) ? m.steps : []).map((x) => String(x || '').trim()).filter(Boolean))];
export const stepSlot = (slot) => (slot?.med?.frequency === 'Once' ? 'all' : `${slot.day}@${slot.time}`);
export const ticksFor = (m, key) => (Array.isArray(m?.steps_done) ? m.steps_done : []).map(String)
  .filter((x) => x.startsWith(`${key}|`)).map((x) => x.slice(key.length + 1));
/** { done, total } for one time it comes around. */
export function stepCount(m, key) {
  const steps = stepsOf(m);
  const t = ticksFor(m, key);
  return { total: steps.length, done: steps.filter((x) => t.includes(x)).length };
}
// Read fresh, so two people ticking at once don't undo each other; drop ticks over a week old.
async function freshTicks(med) {
  let current = med;
  try { const rows = await base44.entities.Medication.filter({ id: med.id }); if (rows?.[0]) current = rows[0]; } catch { /* the copy on screen */ }
  const weekAgo = format(addDays(new Date(), -7), 'yyyy-MM-dd');
  const list = (Array.isArray(current.steps_done) ? current.steps_done : []).map(String)
    .filter((x) => { const k = x.split('|')[0]; return k === 'all' || k.slice(0, 10) >= weekAgo; });
  return list;
}
/** Tick (on) or untick a step for one time a reminder comes around. */
export async function tickStep(slot, step, on) {
  const key = stepSlot(slot);
  const entry = `${key}|${step}`;
  const list = (await freshTicks(slot.med)).filter((x) => x !== entry);
  if (on) list.push(entry);
  await base44.entities.Medication.update(slot.med.id, { steps_done: list });
  return list;
}
/** Undo after the last tick finished it: untick the step ticked last. */
export async function untickLast(slot) {
  const key = stepSlot(slot);
  const list = await freshTicks(slot.med);
  const i = list.map((x) => x.startsWith(`${key}|`)).lastIndexOf(true);
  if (i < 0) return list;
  list.splice(i, 1);
  await base44.entities.Medication.update(slot.med.id, { steps_done: list });
  return list;
}

// More than one person or pet (Anna, Nov 14 2026: "Should be able to click
// multiple people or pets on 'for'"): family_member_ids has them all;
// family_member_id is the first (its color) and family_member_name reads
// "Peach and Kaiju" (one person keeps their full name, like before).
export const andList = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
/** Who a reminder's for, as ids: family_member_ids, or the one family_member_id of an older one. */
export const forIds = (m) => (Array.isArray(m?.family_member_ids) && m.family_member_ids.length ? m.family_member_ids : m?.family_member_id ? [m.family_member_id] : []);

export function cleanMed(form, members, me) {
  const ids = [...new Set((Array.isArray(form.family_member_ids) ? form.family_member_ids : form.family_member_id ? [form.family_member_id] : []).filter(Boolean))];
  const chosen = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const member = chosen[0];
  const times = (form.times || []).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  const once = form.frequency === 'Once';
  const oneTime = form.frequency === ONE_TIME;
  const data = {
    medication_name: form.medication_name.trim(),
    dosage: form.dosage || '',
    frequency: form.frequency,
    family_member_id: ids[0] || '',
    family_member_ids: ids,
    family_member_name: chosen.length > 1 ? andList(chosen.map((m) => String(m.name || '').split(' ')[0])) : member?.name || (ids.length ? form.family_member_name || '' : ''),
    notes: (form.notes || '').trim(),
    // Steps (optional), like a checklist; the ticks stay as they are.
    steps: stepsOf(form),
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
  // A to-do's end time ("3 to 5 PM"), while it's after the start.
  const startAt = once ? form.anchor_time : times[0];
  data.end_time = (once || oneTime) && /^\d{2}:\d{2}$/.test(form.end_time || '') && /^\d{2}:\d{2}$/.test(startAt || '') && form.end_time > startAt ? form.end_time : null;
  // "Until it's done": its pushes come from when it starts and its priority.
  if (once) {
    data.priority = ['low', 'medium', 'high'].includes(form.priority) ? form.priority : 'medium';
    if (form.picked_time && /^\d{2}:\d{2}$/.test(form.anchor_time || '')) {
      // The day and time they picked on the form, as they are.
      data.anchor_time = form.anchor_time;
      data.times = untilTimes(form.anchor_time, data.priority, data.end_time || '');
    } else {
      const start = nagStart(/^\d{2}:\d{2}$/.test(form.anchor_time || '') ? form.anchor_time : (times[0] || defaultTimes('Once')[0]), data.once_date);
      data.anchor_time = start.anchor;
      data.once_date = start.day;
      data.times = untilTimes(start.anchor, data.priority, data.end_time || '');
    }
  }
  if (form.refill_date && !once && !oneTime) data.refill_date = form.refill_date; else data.refill_date = null;
  // A repeating one's last day (empty = "Until I stop it").
  data.end_date = !once && !oneTime && /^\d{4}-\d{2}-\d{2}$/.test(form.end_date || '') ? form.end_date : null;
  if (form.start_date) data.start_date = form.start_date; else data.start_date = null;
  return data;
}

/** An "until it's done" reminder that someone finished (kept for its history, not listed). */
export const isFinishedOnce = (m) => (m?.frequency === 'Once' && m.is_active === false) || (m?.frequency === ONE_TIME && !!m.once_date && m.once_date < todayStr());
export const isPrivate = (m) => m?.visibility === 'private';
/** A repeating reminder past its last day (or stopped with Stop repeating). */
export const isEnded = (m) => !!m?.end_date && m.frequency !== 'Once' && m.frequency !== ONE_TIME && m.end_date < todayStr();

/** Done / total over the last `days` days for one reminder. */
export function adherence(med, logs, days = 14) {
  const since = format(new Date(Date.now() - days * 86400000), 'yyyy-MM-dd');
  const mine = logs.filter((l) => l.medication_id === med.id && l.day >= since && l.status !== 'due');
  const taken = mine.filter((l) => l.status === 'taken').length;
  const missed = mine.filter((l) => l.status === 'missed').length;
  return { taken, missed, skipped: mine.length - taken - missed, total: mine.length };
}

/**
 * One-time reminders as calendar items (Anna, Nov 14 2026: "Adding a one time
 * reminder from here doesnt end up on the calendar. It should."), on their day
 * and time in the range (from/to: 'YYYY-MM-DD'). They carry the reminder
 * itself (reminder), so the calendar opens the reminder, not an event.
 * One for a pet or for someone the family takes care of is care, so it's in
 * their color like a care event (Anna, Nov 14 2026: "Giving the dogs a bath
 * is care"); caredFor(member) says who that is.
 */
export function reminderEvents(reminders = [], from, to, members = [], caredFor = () => false) {
  return (reminders || [])
    .filter((m) => m.frequency === ONE_TIME && m.once_date && m.once_date >= from && m.once_date <= to)
    .map((m) => {
      const time = (Array.isArray(m.times) ? m.times : [])[0] || '';
      return {
        id: `reminder-${m.id}`,
        reminder: m,
        title: `\u{1F514} ${m.medication_name || 'Reminder'}`,
        date: m.once_date,
        time,
        end_time: endOf(m),
        all_day: !time,
        family_member_id: m.family_member_id || '',
        family_member_ids: forIds(m),
        family_member_name: m.family_member_name || '',
        visibility: m.visibility === 'private' ? 'private' : 'family',
        category: 'Other',
        ...(forIds(m).some((id) => caredFor((members || []).find((x) => x.id === id))) ? { care: true } : {}),
        notes: m.notes || '',
        created_by_user_id: m.owner_user_id || m.created_by_id || '',
      };
    });
}

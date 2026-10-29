import { base44 } from '@/api/base44Client';
import { withFamily, getFamilyId } from '@/lib/family';
import { format, parseISO, isValid, startOfDay, addDays, differenceInCalendarDays, isToday, isPast } from 'date-fns';

// Tasks, steps and repeats for GenCare. The repeat model is ADHDone's: a
// repeating task is one row at a time; finishing it makes the NEXT copy (and
// remembers which one, next_occurrence_id), so un-finishing can take exactly
// that copy back. A checklist is a task whose steps the whole family ticks;
// when the last step is ticked the checklist is finished and, if it repeats,
// tomorrow's (or next week's) copy appears with every step unticked.

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'every_other_day', label: 'Every other day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'every_other_week', label: 'Every other week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const CATEGORIES = ['Appointments', 'School', 'Grocery', 'Household', 'Transportation', 'Financial', 'Personal Care', 'Other'];

export const isOpen = (t) => t && (t.status === 'pending' || t.status === 'in_progress');
export const isStep = (t) => !!t?.parent_task_id;
export const repeats = (t) => !!t && !!t.recurrence && t.recurrence !== 'none' && (t.is_recurring !== false || t.kind === 'checklist');

export const today = () => format(new Date(), 'yyyy-MM-dd');

export function dueDateOf(t) {
  if (!t?.due_date) return null;
  const d = parseISO(t.due_date);
  return isValid(d) ? startOfDay(d) : null;
}

/** Overdue = its day is before today (a time later today is not overdue yet). */
export function isOverdue(t) {
  const d = dueDateOf(t);
  return !!d && !isToday(d) && isPast(d);
}

export function recurrenceLabel(t) {
  if (!repeats(t)) return '';
  if (t.recurrence === 'weekly' && Array.isArray(t.recurrence_days) && t.recurrence_days.length) {
    const names = t.recurrence_days.filter((n) => n >= 0 && n <= 6).map((n) => DAY_NAMES[n]);
    return names.length === 7 ? 'Every day' : names.join(', ');
  }
  return REPEAT_OPTIONS.find((o) => o.value === t.recurrence)?.label || '';
}

/** One cycle of the pattern after `date` (a Date at local midnight). */
export function advance(date, pattern, days) {
  const d = new Date(date);
  const set = Array.isArray(days) ? days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  switch (pattern) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'every_other_day': d.setDate(d.getDate() + 2); break;
    case 'weekdays':
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      if (set.length) {
        d.setDate(d.getDate() + 1);
        let guard = 0;
        while (!set.includes(d.getDay()) && guard++ < 7) d.setDate(d.getDate() + 1);
      } else d.setDate(d.getDate() + 7);
      break;
    case 'every_other_week': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: break;
  }
  return d;
}

/**
 * The day the next copy is for: one cycle after this one's own day, and
 * never a day already gone. A late finish (yesterday's checklist done this
 * morning) counts for today too, so the next copy is the first day after today.
 */
export function nextOccurrenceDate(t, now = new Date()) {
  const base = dueDateOf(t) || startOfDay(now);
  const todayStart = startOfDay(now);
  let next = advance(base, t.recurrence, t.recurrence_days);
  let guard = 0;
  while (next <= todayStart && guard++ < 1000) next = advance(next, t.recurrence, t.recurrence_days);
  return next;
}

export function fmtDate(d) {
  return format(d, 'yyyy-MM-dd');
}

/** Section a task belongs to on the Tasks page. */
export function sectionOf(t, now = new Date()) {
  const d = dueDateOf(t);
  if (!d) return 'nodate';
  const diff = differenceInCalendarDays(d, startOfDay(now));
  if (diff <= 0) return 'today'; // overdue sits with today, marked
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

export const SECTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'nodate', label: 'No date' },
];

/** Sort: overdue first, then by date, timed before untimed, then urgency, then newest. */
export function sortTasks(list) {
  const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
  return [...list].sort((a, b) => {
    const da = a.due_date || '9999', db = b.due_date || '9999';
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.due_time || '99:99', tb = b.due_time || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const pa = rank[a.priority] ?? 2, pb = rank[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.created_date || '').localeCompare(a.created_date || '');
  });
}

/** Strip empty strings so Base44 never sees '' for a date or an enum. */
export function clean(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === '' || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ---------- writes ----------

export async function createTask(data, { notify = true } = {}) {
  const fields = clean({
    kind: 'task',
    priority: 'medium',
    category: 'Other',
    status: 'pending',
    ...data,
  });
  if (fields.recurrence && fields.recurrence !== 'none') fields.is_recurring = true;
  else { fields.recurrence = 'none'; fields.is_recurring = false; }
  const created = await base44.entities.CareTask.create(withFamily(fields));
  if (notify && created?.id && !fields.parent_task_id) {
    base44.functions.invoke('notifyFamily', { kind: 'task', action: fields.assigned_user_id ? 'assigned' : 'added', task_id: created.id }).catch(() => {});
  }
  return created;
}

export async function updateTask(id, patch, { before } = {}) {
  const fields = { ...patch };
  // Nulls clear a field; '' never reaches the server.
  for (const k of Object.keys(fields)) if (fields[k] === '') fields[k] = null;
  if ('recurrence' in fields) fields.is_recurring = !!fields.recurrence && fields.recurrence !== 'none';
  const updated = await base44.entities.CareTask.update(id, fields);
  if (before && fields.assigned_user_id && fields.assigned_user_id !== before.assigned_user_id) {
    base44.functions.invoke('notifyFamily', { kind: 'task', action: 'assigned', task_id: id }).catch(() => {});
  }
  return updated;
}

export async function addStep(parent, label) {
  const existing = await base44.entities.CareTask.filter({ parent_task_id: parent.id });
  const order = (existing || []).reduce((m, s) => Math.max(m, s.subtask_order || 0), 0) + 1;
  return base44.entities.CareTask.create(withFamily({
    title: label,
    parent_task_id: parent.id,
    subtask_order: order,
    status: 'pending',
    priority: parent.priority || 'medium',
    category: parent.category || 'Other',
    family_member_id: parent.family_member_id || undefined,
    family_member_name: parent.family_member_name || undefined,
    kind: 'task',
    recurrence: 'none',
  }));
}

/** Delete a task and its steps. */
export async function deleteTask(task) {
  const steps = isStep(task) ? [] : (await base44.entities.CareTask.filter({ parent_task_id: task.id })) || [];
  for (const s of steps) await base44.entities.CareTask.delete(s.id);
  await base44.entities.CareTask.delete(task.id);
}

/**
 * Finish a task. A repeating one gets its next copy (steps copied unticked).
 * Returns { task, next } where next is the copy or null.
 */
export async function completeTask(task, me, { notify = true } = {}) {
  const now = new Date();
  const patch = {
    status: 'completed',
    completed_at: now.toISOString(),
    completed_by_user_id: me?.id || undefined,
    completed_by_name: me?.display_name || me?.full_name || undefined,
  };
  let next = null;
  if (repeats(task) && !isStep(task)) {
    // Never twice: a second tap, or un-finish then finish again.
    if (task.next_occurrence_id) {
      try { next = await base44.entities.CareTask.get(task.next_occurrence_id); } catch (e) { next = null; }
    }
    if (!next || next.family_id !== getFamilyId()) {
      const nextDate = nextOccurrenceDate(task, now);
      next = await base44.entities.CareTask.create(withFamily(clean({
        title: task.title,
        description: task.description,
        notes: task.notes,
        kind: task.kind || 'task',
        priority: task.priority || 'medium',
        category: task.category || 'Other',
        status: 'pending',
        due_date: fmtDate(nextDate),
        due_time: task.due_time,
        assigned_to: task.assigned_to,
        assigned_user_id: task.assigned_user_id,
        family_member_id: task.family_member_id,
        family_member_name: task.family_member_name,
        recurrence: task.recurrence,
        recurrence_days: Array.isArray(task.recurrence_days) && task.recurrence_days.length ? task.recurrence_days : undefined,
        is_recurring: true,
      })));
      patch.next_occurrence_id = next.id;
      // Its steps come along, all unticked.
      const steps = (await base44.entities.CareTask.filter({ parent_task_id: task.id })) || [];
      for (const s of [...steps].sort((a, b) => (a.subtask_order || 0) - (b.subtask_order || 0))) {
        await base44.entities.CareTask.create(withFamily(clean({
          title: s.title, parent_task_id: next.id, subtask_order: s.subtask_order, status: 'pending',
          priority: next.priority, category: next.category, family_member_id: next.family_member_id,
          family_member_name: next.family_member_name, kind: 'task', recurrence: 'none',
        })));
      }
    }
  }
  const updated = await base44.entities.CareTask.update(task.id, clean(patch));
  if (notify && !isStep(task)) base44.functions.invoke('notifyFamily', { kind: 'task', action: 'completed', task_id: task.id }).catch(() => {});
  return { task: updated, next };
}

/** Take a finish back. Removes the copy that finish made, if nobody touched it. */
export async function uncompleteTask(task) {
  if (task.next_occurrence_id) {
    try {
      const copy = await base44.entities.CareTask.get(task.next_occurrence_id);
      if (copy && copy.status === 'pending' && copy.title === task.title) {
        const steps = (await base44.entities.CareTask.filter({ parent_task_id: copy.id })) || [];
        if (steps.every((s) => s.status !== 'completed')) {
          for (const s of steps) await base44.entities.CareTask.delete(s.id);
          await base44.entities.CareTask.delete(copy.id);
        }
      }
    } catch (e) { /* already gone */ }
  }
  return base44.entities.CareTask.update(task.id, { status: 'pending', completed_at: null, completed_by_user_id: null, completed_by_name: null, next_occurrence_id: null, reminder_sent_at: null });
}

/**
 * Tick or untick one step. Ticking the last open step finishes the parent
 * (which makes the next copy of a repeating checklist); unticking a step of a
 * finished parent reopens it.
 */
export async function toggleStep(step, allSteps, parent, me) {
  const done = step.status === 'completed';
  await base44.entities.CareTask.update(step.id, done
    ? { status: 'pending', completed_at: null, completed_by_name: null, completed_by_user_id: null }
    : clean({ status: 'completed', completed_at: new Date().toISOString(), completed_by_name: me?.display_name || me?.full_name, completed_by_user_id: me?.id }));
  const others = allSteps.filter((s) => s.id !== step.id);
  const allDone = !done && others.every((s) => s.status === 'completed');
  if (allDone && isOpen(parent)) return completeTask(parent, me, { notify: parent.kind !== 'checklist' });
  if (done && parent.status === 'completed') await uncompleteTask(parent);
  return null;
}

/** The copy that will be made when this task is finished, as a sentence. */
export function nextCopyText(t) {
  if (!repeats(t)) return '';
  const d = nextOccurrenceDate(t);
  return `Comes back ${isToday(addDays(d, -1)) ? 'tomorrow' : format(d, 'EEE, MMM d')}`;
}

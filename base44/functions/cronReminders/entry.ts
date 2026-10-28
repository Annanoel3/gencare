import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { familyUsers, sendPush, wantsPush, whenText } from '../../shared/push.ts';
import { canSee } from '../../shared/sharing.ts';
import { expandAppointments } from '../../shared/recurrence.ts';

// Runs every 15 minutes (workflow "Reminders every 15 minutes"). Three jobs,
// each in the family's own time (the owner's timezone, else the first
// member's, else America/Chicago):
//
//   1. Appointment reminders: `reminder_minutes` before an event (default 60),
//      pushed to every family member who wants reminders — or only the person
//      who added it when the event is private. Marked reminder_sent so it
//      goes once.
//   2. Task due-time pushes: a task with a due date AND time, at that time.
//   3. The morning digest at 7:00 local: today's events and the tasks due
//      today or overdue, one push per person, once a day.
//
// Replaces checkDueTasks (Jul 2026), which pushed every task in the whole
// app to every user at 13:00 UTC.

const WINDOW_MS = 15 * 60_000;
const DIGEST_HOUR = 7;

function partsIn(tz: string, when: Date) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(when)) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

function safeTz(tz: string | undefined) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz || '' }); return tz as string; } catch (_) { return 'America/Chicago'; }
}

// Epoch ms of a local date+time in tz (good to the minute; DST handled by Intl).
function localToMs(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  if (!y || !m || !d) return 0;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  // Offset of tz at that moment.
  const asTz = new Date(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(guess)).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z')).getTime();
  const offset = asTz - guess;
  return guess - offset;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const now = Date.now();
  const out: Record<string, number> = { families: 0, appointment_reminders: 0, task_pushes: 0, digests: 0 };
  try {
    const families = (await db.Family.list()) || [];
    for (const fam of families) {
      out.families++;
      const users = await familyUsers(db, fam.id);
      if (!users.length) continue;
      const owner = users.find((u: any) => u.id === fam.owner_user_id) || users[0];
      const tz = safeTz(owner.timezone);
      const local = partsIn(tz, new Date(now));
      const today = local.day;
      const tomorrow = addDays(today, 1);

      // 1. Appointment reminders (today's and tomorrow's rows; a reminder can
      //    land the evening before an early event).
      //    A repeating event lands on today through its RRULE, not its row date,
      //    so the series rows come along and are expanded per day; a reminder
      //    for an occurrence is remembered by its day (reminder_sent_for).
      const plain = [
        ...((await db.Appointment.filter({ family_id: fam.id, date: today })) || []),
        ...((await db.Appointment.filter({ family_id: fam.id, date: tomorrow })) || []),
      ].filter((a: any) => !a.recurrence);
      let series: any[] = [];
      try { series = (await db.Appointment.filter({ family_id: fam.id, recurrence: { $regex: '^RRULE' } })) || []; }
      catch (_) { series = ((await db.Appointment.filter({ family_id: fam.id })) || []).filter((a: any) => a.recurrence); }
      const appts = expandAppointments([...plain, ...series], today, tomorrow);
      for (const a of appts) {
        const isSeries = !!a.occurrence_of;
        if (isSeries ? a.reminder_sent_for === a.date : a.reminder_sent) continue;
        if (a.all_day || !a.time) continue;
        const minutes = typeof a.reminder_minutes === 'number' ? a.reminder_minutes : 60;
        if (minutes < 0) continue;
        const startMs = localToMs(a.date, a.time, a.timezone ? safeTz(a.timezone) : tz);
        if (!startMs) continue;
        const fireAt = startMs - minutes * 60_000;
        if (now < fireAt || now >= fireAt + WINDOW_MS) continue;
        const forWhom = a.family_member_name ? ` for ${a.family_member_name}` : '';
        const inText = minutes >= 60 ? `in ${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}` : `in ${minutes} min`;
        const targets = users.filter((u: any) => canSee(a, u.id));
        for (const u of targets) {
          if (!wantsPush(u, 'reminders')) continue;
          await sendPush({
            email: u.email,
            title: `${a.title}${forWhom} ${inText}`,
            message: `${whenText(a.date, a.time, tz)}${a.location ? ` · ${a.location}` : ''}`,
            data: { type: 'appointment_reminder', appointmentId: a.id, screen: '/calendar', date: a.date },
            priority: 'high',
          });
          out.appointment_reminders++;
        }
        if (isSeries) await db.Appointment.update(a.occurrence_of, { reminder_sent_for: a.date });
        else await db.Appointment.update(a.id, { reminder_sent: true });
      }

      // 2. Tasks at their due time.
      const dueTasks = (await db.CareTask.filter({ family_id: fam.id, due_date: today })) || [];
      for (const t of dueTasks) {
        if (!t.due_time || t.reminder_sent_at || t.parent_task_id) continue;
        if (t.status === 'completed' || t.status === 'cancelled') continue;
        const dueMs = localToMs(t.due_date, t.due_time, tz);
        if (!dueMs || now < dueMs || now >= dueMs + WINDOW_MS) continue;
        const targets = t.assigned_user_id ? users.filter((u: any) => u.id === t.assigned_user_id) : users;
        for (const u of targets) {
          if (!wantsPush(u, 'reminders')) continue;
          await sendPush({
            email: u.email,
            title: `Due now: ${t.title}`,
            message: t.family_member_name ? `For ${t.family_member_name}` : (t.description || 'Tap to open the task'),
            data: { type: 'task_due', taskId: t.id, screen: '/tasks' },
            priority: 'high',
          });
          out.task_pushes++;
        }
        await db.CareTask.update(t.id, { reminder_sent_at: new Date(now).toISOString() });
      }

      // 3. Morning digest.
      if (local.hour === DIGEST_HOUR && local.minute < 15) {
        const todays = appts.filter((a: any) => a.date === today);
        const allTasks = (await db.CareTask.filter({ family_id: fam.id })) || [];
        // Steps live inside their task and never count on their own.
        const open = allTasks.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled' && !t.parent_task_id);
        const dueToday = open.filter((t: any) => t.due_date === today);
        const overdue = open.filter((t: any) => t.due_date && t.due_date < today);
        if (!todays.length && !dueToday.length && !overdue.length) continue; // an empty day sends nothing
        for (const u of users) {
          if (!wantsPush(u, 'reminders')) continue;
          if (u.digest_sent_on === today) continue;
          const mine = todays.filter((a: any) => canSee(a, u.id));
          const parts: string[] = [];
          if (mine.length) parts.push(`${mine.length} event${mine.length > 1 ? 's' : ''}: ${mine.slice(0, 3).map((a: any) => `${a.title}${a.time ? ` ${whenText(a.date, a.time, tz).split(' at ')[1]}` : ''}`).join(', ')}${mine.length > 3 ? ` +${mine.length - 3}` : ''}`);
          if (dueToday.length) parts.push(`${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`);
          if (overdue.length) parts.push(`${overdue.length} overdue`);
          if (!parts.length) continue;
          await sendPush({
            email: u.email,
            title: `Today for ${fam.name || 'your family'}`,
            message: parts.join(' · '),
            data: { type: 'digest', screen: '/' },
          });
          await db.User.update(u.id, { digest_sent_on: today });
          out.digests++;
        }
      }
    }
    return Response.json({ ok: true, ...out });
  } catch (e) {
    console.error('[cronReminders]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message, ...out }, { status: 500 });
  }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { pushFamily, sendPush, whenText } from '../../shared/push.ts';

// Pushes a signed-in person may send: only to their OWN family, with text the
// server composes from the record (never free text to someone else's phone).
//
//   { kind: "appointment", action: "added"|"changed"|"removed", appointment_id, before?, title?, date?, time? }
//        before (on changed): how it looked before the edit, so the push says what changed;
//        a change with nothing worth telling (sharing, colors) sends nothing
//        -> every other family member who wants family-event pushes
//   { kind: "task", action: "added"|"assigned"|"completed", task_id }
//   { kind: "message", message_id }
//   { kind: "notes", record_id, user_ids }  -> the people the caller's notes were just shared with
//   { kind: "test" }  -> a push to the caller's own phone, to check the setup
const first = (s: unknown) => String(s || '').trim().split(' ')[0];
const cut = (s: unknown, n: number) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const clock = (t: unknown) => {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return String(t || '');
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/**
 * Plain lines saying what's different now, from how the event looked before
 * the edit (sent by the app, read from the database when the edit began) and
 * how it's saved now. Only these fields; the words are written here.
 */
function changesOf(before: any, now: any, tz: string | undefined): string[] {
  const out: string[] = [];
  const allDayNow = !!now.all_day;
  const allDayWas = !!before.all_day;
  if (!same(before.date, now.date) || !same(before.time, now.time) || allDayNow !== allDayWas) {
    const nowWhen = whenText(now.date, now.time, tz, allDayNow);
    const wasWhen = whenText(before.date, before.time, tz, allDayWas);
    const sameDay = same(before.date, now.date);
    if (sameDay && !allDayNow && !allDayWas && before.time && now.time) out.push(`Now at ${clock(now.time)} (was ${clock(before.time)})`);
    else if (sameDay && allDayNow && !allDayWas) out.push(`All day now${before.time ? ` (was ${clock(before.time)})` : ''}`);
    else if (sameDay && !allDayNow && allDayWas && now.time) out.push(`Now at ${clock(now.time)} (was all day)`);
    else out.push(`Now ${nowWhen} (was ${wasWhen})`);
  } else if (!same(before.end_time, now.end_time) && !allDayNow) {
    out.push(now.end_time ? `Ends at ${clock(now.end_time)}${before.end_time ? ` (was ${clock(before.end_time)})` : ''}` : 'No end time now');
  }
  if (!same(before.end_date, now.end_date) && (before.end_date || now.end_date)) {
    out.push(now.end_date ? `Runs through ${whenText(now.end_date, '', tz, true)}` : 'Just one day now');
  }
  if (!same(before.title, now.title) && before.title) out.push(`Renamed (was “${cut(before.title, 50)}”)`);
  if (!same(before.location, now.location)) {
    out.push(now.location ? `Place: ${cut(now.location, 70)}${before.location ? ` (was ${cut(before.location, 50)})` : ''}` : 'Place taken off');
  }
  if (!same(before.family_member_name, now.family_member_name)) {
    out.push(now.family_member_name ? `Now for ${first(now.family_member_name)}` : `No longer for ${first(before.family_member_name)}`);
  }
  if (!same(before.recurrence, now.recurrence)) out.push(now.recurrence ? (before.recurrence ? 'Repeats differently now' : 'Repeats now') : 'No longer repeats');
  if (!same(before.notes, now.notes)) out.push(now.notes ? 'Notes changed' : 'Notes taken off');
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const user = (await db.User.filter({ id: me.id }))?.[0] || me;
    const familyId = user.family_id;
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || '');
    // First name only ("Pamela added…", not "Pamela Hefner added…").
    const who = String(user.display_name || user.full_name || '').trim().split(' ')[0] || 'Someone';

    if (kind === 'test') {
      const r = await sendPush({ email: user.email, title: 'GenCare is set up', message: 'Notifications reach this phone.', data: { type: 'test', screen: '/settings' } });
      return Response.json({ ok: r.ok, recipients: r.recipients, error: r.error || null });
    }
    if (!familyId) return Response.json({ ok: false, error: 'No family' }, { status: 400 });

    if (kind === 'appointment') {
      const action = String(body.action || 'added');
      let appt: any = null;
      if (body.appointment_id) appt = (await db.Appointment.filter({ id: String(body.appointment_id) }))?.[0] || null;
      if (appt && appt.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      if (appt && appt.visibility === 'private') return Response.json({ ok: true, sent: [], skipped: 'private' });
      // Shared with certain people only: only they hear about it.
      const onlyUserIds = appt && appt.visibility === 'some' ? (Array.isArray(appt.shared_with) ? appt.shared_with : []) : undefined;
      const title = cut(appt?.title || body.title || 'an event', 60);
      const forWhom = appt?.family_member_name || body.family_member_name || '';
      const forText = forWhom ? ` for ${first(forWhom)}` : '';
      const tz = appt?.timezone || user.timezone;
      const when = whenText(appt?.date || body.date, appt?.time || body.time, tz, !!appt?.all_day);
      let heading = '';
      let message = '';
      if (action === 'removed') {
        // Anna, Oct 31 2026: "Pamela Hefner changed to the calendar" isn't proper English.
        heading = `${who} removed ${title}${forText}`;
        message = `It was ${when}. It's off the calendar now.`;
      } else if (action === 'changed') {
        heading = `${who} changed ${title}${forText}`;
        // What changed (Anna, Oct 31 2026: "it doesn't show what was changed").
        const before = body.before && typeof body.before === 'object' ? body.before : null;
        if (appt && before) {
          const lines = changesOf(before, appt, tz);
          if (!lines.length) return Response.json({ ok: true, sent: [], skipped: 'nothing_to_tell' });
          message = lines.join(' · ');
        } else {
          message = `Now ${when}${appt?.location ? ` · ${cut(appt.location, 60)}` : ''}`;
        }
      } else {
        heading = `${who} added ${title}${forText}`;
        message = `${when}${appt?.location ? ` · ${cut(appt.location, 60)}` : ''}`;
      }
      const sent = await pushFamily(db, familyId, {
        title: cut(heading, 90),
        message: cut(message, 220),
        data: { type: 'appointment', action, appointmentId: appt?.id || body.appointment_id || '', screen: '/calendar', date: appt?.date || body.date || '' },
        exceptUserId: user.id,
        onlyUserIds,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent, message });
    }

    if (kind === 'task') {
      const action = String(body.action || 'added');
      const task = body.task_id ? (await db.CareTask.filter({ id: String(body.task_id) }))?.[0] : null;
      if (task && task.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      const title = task?.title || 'a task';
      let onlyUserIds: string[] | undefined = undefined;
      let heading = `${who} added a task`;
      if (action === 'assigned' && task?.assigned_user_id) {
        onlyUserIds = [task.assigned_user_id];
        heading = `${who} assigned you a task`;
      } else if (action === 'completed') {
        heading = `${who} finished a task`;
      }
      const due = task?.due_date ? ` · due ${whenText(task.due_date, task.due_time, user.timezone)}` : '';
      const sent = await pushFamily(db, familyId, {
        title: heading,
        message: `${title}${due}`,
        data: { type: 'task', action, taskId: task?.id || '', screen: '/tasks' },
        exceptUserId: user.id,
        onlyUserIds,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent });
    }

    if (kind === 'message') {
      const msg = body.message_id ? (await db.FamilyMessage.filter({ id: String(body.message_id) }))?.[0] : null;
      if (!msg || msg.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      const text = String(msg.content || '').slice(0, 140);
      const sent = await pushFamily(db, familyId, {
        title: `${who} posted in Messages`,
        message: text,
        data: { type: 'message', messageId: msg.id, screen: '/messages' },
        exceptUserId: user.id,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent });
    }

    // Visit notes the recorder just shared (Anna, Oct 30 2026: never on their
    // own; whoever recorded them picks the whole family or certain people).
    // Only the people newly shared with (user_ids) hear about it, and only
    // if the notes really are shared with them now.
    if (kind === 'notes') {
      const rec = body.record_id ? (await db.NoteRecording.filter({ id: String(body.record_id) }))?.[0] : null;
      if (!rec || rec.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      if (rec.user_id && rec.user_id !== user.id) return Response.json({ ok: false, error: 'Not yours' }, { status: 403 });
      const sharedTo = (uid: string) => rec.shared_with_family === true || (Array.isArray(rec.shared_with) && rec.shared_with.includes(uid));
      const wanted = Array.isArray(body.user_ids) ? body.user_ids.map(String) : [];
      const onlyUserIds = wanted.filter((uid: string) => uid !== user.id && sharedTo(uid));
      if (!onlyUserIds.length) return Response.json({ ok: true, sent: [] });
      const what = String(rec.title || rec.notes?.title || 'Visit notes');
      const sent = await pushFamily(db, familyId, {
        title: `${who} shared notes with you`,
        message: `${what}${rec.family_member_name ? ` · about ${String(rec.family_member_name).split(' ')[0]}` : ''}`,
        data: { type: 'notes', recordId: rec.id, screen: `/notes?open=${rec.id}` },
        exceptUserId: user.id,
        onlyUserIds,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent });
    }

    return Response.json({ ok: false, error: 'Unknown kind' }, { status: 400 });
  } catch (e) {
    console.error('[notifyFamily]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

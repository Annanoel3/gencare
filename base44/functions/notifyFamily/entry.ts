import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { pushFamily, sendPush, whenText } from '../../shared/push.ts';

// Pushes a signed-in person may send: only to their OWN family, with text the
// server composes from the record (never free text to someone else's phone).
//
//   { kind: "appointment", action: "added"|"changed"|"removed", appointment_id, title?, date?, time? }
//        -> every other family member who wants family-event pushes
//   { kind: "task", action: "added"|"assigned"|"completed", task_id }
//   { kind: "message", message_id }
//   { kind: "test" }  -> a push to the caller's own phone, to check the setup
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
    const who = user.display_name || (user.full_name ? user.full_name.split(' ')[0] : 'Someone');

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
      const title = appt?.title || body.title || 'an event';
      const forWhom = appt?.family_member_name || body.family_member_name || '';
      const when = whenText(appt?.date || body.date, appt?.time || body.time, user.timezone, !!appt?.all_day);
      const verb = action === 'removed' ? 'removed' : action === 'changed' ? 'changed' : 'added';
      const message = action === 'removed'
        ? `${title}${forWhom ? ` for ${forWhom}` : ''} (${when}) was taken off the calendar.`
        : `${title}${forWhom ? ` for ${forWhom}` : ''} — ${when}`;
      const sent = await pushFamily(db, familyId, {
        title: `${who} ${verb} ${action === 'removed' ? 'an event' : 'to the calendar'}`,
        message,
        data: { type: 'appointment', action, appointmentId: appt?.id || body.appointment_id || '', screen: '/calendar', date: appt?.date || body.date || '' },
        exceptUserId: user.id,
        onlyUserIds,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent });
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

    return Response.json({ ok: false, error: 'Unknown kind' }, { status: 400 });
  } catch (e) {
    console.error('[notifyFamily]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { familyUsers, pushFamily, sendPush, wantsPush, whenText } from '../../shared/push.ts';
import { canSee } from '../../shared/sharing.ts';

// Pushes a signed-in person may send: only to their OWN family, with text the
// server composes from the record (never free text to someone else's phone).
//
//   { kind: "appointment", action: "added"|"changed"|"removed", appointment_id, before?, title?, date?, time? }
//        before (on changed): how it looked before the edit, so the push says what changed;
//        a change with nothing worth telling (sharing, colors) sends nothing
//        -> every other family member who wants family-event pushes
//   { kind: "task", action: "added"|"assigned"|"completed", task_id }
//   { kind: "message", message_id }
//   { kind: "appointments", appointment_ids }  -> one push per person for several events added at once
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

    // A fall logged in the Care Log (Anna, Nov 10 2026): everyone in the
    // family hears right away, whatever their other choices, like an
    // announcement. Once per entry (the app only sends it when it's created).
    if (kind === 'care_alert') {
      const log = body.log_id ? (await db.CareLog.filter({ id: String(body.log_id) }))?.[0] : null;
      if (!log || log.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      if (!(log.entry_type === 'care_log' && log.sub_type === 'fall')) return Response.json({ ok: true, sent: [] });
      // Logged as Only you (tracking for yourself, Nov 13 2026): it stays yours.
      if (log.visibility === 'private') return Response.json({ ok: true, sent: [] });
      const person = first(log.family_member_name) || 'Someone';
      const t = new Date(String(log.timestamp || ''));
      const at = Number.isNaN(t.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { timeZone: user.timezone || 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(t);
      const detail = [String(log.title || '').toLowerCase() === 'fall' ? '' : cut(log.title, 80), cut(log.notes, 160)].filter(Boolean).join(' · ');
      const sent = await pushFamily(db, familyId, {
        title: `${person} had a fall`,
        message: `${who} logged it${at ? ` at ${at}` : ''}.${detail ? ` ${detail}` : ''}`,
        data: { type: 'care_alert', logId: log.id, screen: `/care-log?for=${log.family_member_id}` },
        exceptUserId: user.id,
        need: 'announcements',
        priority: 'high',
      });
      return Response.json({ ok: true, sent });
    }

    if (kind === 'message') {
      const msg = body.message_id ? (await db.FamilyMessage.filter({ id: String(body.message_id) }))?.[0] : null;
      if (!msg || msg.family_id !== familyId) return Response.json({ ok: false, error: 'Not your family' }, { status: 403 });
      // An announcement: the whole thing, to everyone, right away (Anna, Nov
      // 10 2026), opening Home where it sits at the top.
      // One set for later goes out from cronReminders at its time; once it's
      // gone out (announce_sent) it isn't sent again.
      if (msg.category === 'Announcement' && !msg.parent_id) {
        const at = msg.announce_at ? new Date(String(msg.announce_at)).getTime() : 0;
        if (at && at > Date.now() + 60_000) return Response.json({ ok: true, sent: [], skipped: 'scheduled' });
        if (msg.announce_sent) return Response.json({ ok: true, sent: [], skipped: 'already_sent' });
        await db.FamilyMessage.update(msg.id, { announce_sent: true });
        const author = first(msg.author_name) || who;
        const sent = await pushFamily(db, familyId, {
          title: `Announcement from ${author}`,
          message: String(msg.content || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          data: { type: 'announcement', messageId: msg.id, screen: '/' },
          exceptUserId: msg.author_user_id || user.id,
          need: 'announcements',
          priority: 'high',
        });
        return Response.json({ ok: true, sent });
      }
      const text = String(msg.content || '').slice(0, 140);
      const sent = await pushFamily(db, familyId, {
        title: `${who} posted in the Feed`,
        message: text,
        data: { type: 'message', messageId: msg.id, screen: '/messages' },
        exceptUserId: user.id,
        need: 'family_events',
      });
      return Response.json({ ok: true, sent });
    }

    // Several events added at once (from a photo, Anna Nov 9 2026): one push
    // per person naming how many they can see, not one push per event.
    // action "removed": several taken off at once (a photo's events, Nov 12
    // 2026), sent just before they're deleted. removed_count: a new schedule
    // replaced this many old ones, said in the "added" push.
    if (kind === 'appointments') {
      const removing = String(body.action || '') === 'removed';
      const removedCount = Math.max(0, Math.floor(Number(body.removed_count) || 0));
      const ids = (Array.isArray(body.appointment_ids) ? body.appointment_ids : []).map(String).slice(0, 60);
      const rows: any[] = [];
      for (const aid of ids) {
        const a = (await db.Appointment.filter({ id: aid }))?.[0];
        if (a && a.family_id === familyId && a.visibility !== 'private') rows.push(a);
      }
      if (!rows.length) return Response.json({ ok: true, sent: [] });
      rows.sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')) || String(x.time || '').localeCompare(String(y.time || '')));
      const people = await familyUsers(db, familyId);
      const sent: string[] = [];
      for (const u of people) {
        if (u.id === user.id || !wantsPush(u, 'family_events')) continue;
        const theirs = rows.filter((a) => canSee(a, u.id));
        if (!theirs.length) continue;
        const firstOne = theirs[0];
        const verb = removing ? 'took off' : 'added';
        const title = (theirs.length === 1 ? `${who} ${verb} ${cut(firstOne.title, 60)}` : `${who} ${verb} ${theirs.length} events`)
          + (!removing && removedCount ? ` and took off ${removedCount}` : '');
        const message = theirs.length === 1
          ? whenText(firstOne.date, firstOne.time, firstOne.timezone || user.timezone, !!firstOne.all_day)
          : cut(theirs.slice(0, 3).map((a) => `${cut(a.title, 40)} (${whenText(a.date, '', user.timezone, true)})`).join(' · ') + (theirs.length > 3 ? ` · and ${theirs.length - 3} more` : ''), 220);
        const r = await sendPush({ email: u.email, title, message, data: removing
          ? { type: 'appointment', action: 'removed', screen: '/calendar', date: firstOne.date || '' }
          : { type: 'appointment', action: 'added', appointmentId: firstOne.id, screen: '/calendar', date: firstOne.date || '' } });
        if (r.ok) sent.push(u.id);
      }
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

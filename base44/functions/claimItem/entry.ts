import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { familyUsers, sendPush, wantsPush, whenText } from '../../shared/push.ts';
import { canSee } from '../../shared/sharing.ts';
import { claimDayFor, claimOn, claimsOf, pruneClaims } from '../../shared/claims.ts';

// "I'll take it" and "Let go" (Anna, Oct 30 2026), for events and reminders,
// and checking an event off on To-do or undoing that ("check" / "uncheck").
//
//   { kind: "event", id, ids?, date, action: "take" | "release" }
//   { kind: "reminder", id, date, action: "take" | "release" }
//   { kind: "event", id, ids?, date, action: "check" | "uncheck" }
//
// id is the row to put the claim on. For an event shown once for two
// calendars, ids lists every copy, so a claim on any of them counts and
// letting go clears it wherever it is. date is the day it happens (for
// something that repeats, the claim is for that day only).
//
// Rules: only people who can see it can take it, nothing private ("just me")
// can be taken, one person per day, and only the person who took it can let
// it go. The person who added it gets a push either way (unless that's them).
// From then on its reminders go only to whoever took it (cronReminders).

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const first = (s: unknown) => String(s || '').trim().split(' ')[0];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const user = (await db.User.filter({ id: me.id }))?.[0] || me;
    const familyId = user.family_id;
    if (!familyId) return Response.json({ ok: false, error: 'No family' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'reminder' ? 'reminder' : body?.kind === 'event' ? 'event' : '';
    const action = ['take', 'release', 'check', 'uncheck'].includes(body?.action) ? String(body.action) : '';
    const id = String(body?.id || '');
    const date = String(body?.date || '');
    if (!kind || !action || !id) return Response.json({ ok: false, error: 'kind, id and action are needed' }, { status: 400 });

    const name = String(user.display_name || first(user.full_name) || first(user.email) || 'Someone').trim();
    const tz = user.timezone || 'America/Chicago';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const now = new Date().toISOString();

    // The rows: the one to write, plus any copies shown with it.
    const table = kind === 'event' ? db.Appointment : db.Medication;
    const target = (await table.filter({ id }))?.[0];
    if (!target || target.family_id !== familyId) return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    const visibleTo = (row: any) => kind === 'event'
      ? canSee(row, user.id)
      : row.visibility !== 'private' || row.owner_user_id === user.id || row.created_by_id === user.id;
    if (!visibleTo(target)) return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    const checking = action === 'check' || action === 'uncheck';
    if (checking && kind !== 'event') return Response.json({ ok: false, error: 'Reminders are marked done on their own' }, { status: 400 });
    // Anything you can see can be checked off (your own "just me" events too);
    // only shared things can be taken.
    if (!checking && target.visibility === 'private') return Response.json({ ok: false, error: 'private' }, { status: 400 });

    const rows = [target];
    if (kind === 'event' && Array.isArray(body?.ids)) {
      for (const other of body.ids.slice(0, 6).map(String)) {
        if (!other || other === id) continue;
        const row = (await db.Appointment.filter({ id: other }))?.[0];
        if (row && row.family_id === familyId && canSee(row, user.id)) rows.push(row);
      }
    }

    const day = claimDayFor(kind, target, date);
    if (day && !DAY.test(day)) return Response.json({ ok: false, error: 'date is needed for something that repeats' }, { status: 400 });

    // Checked off on To-do (Anna, Nov 2 2026: "there's no way to check some
    // of these off"). Anyone who can see it can check it off or undo that,
    // like a reminder's Done; its reminders stop (cronReminders).
    if (checking) {
      const checksOf = (r: any) => (Array.isArray(r?.checks) ? r.checks : []).filter((c: any) => c && c.user_id);
      const done = rows.map((r) => checksOf(r).find((c: any) => String(c.day || '') === day)).find(Boolean) || null;
      if (action === 'check') {
        if (done) return Response.json({ ok: true, check: done, already: true });
        const check = { day, user_id: user.id, name, at: now };
        const kept = pruneClaims(checksOf(target).filter((c: any) => String(c.day || '') !== day), today);
        await db.Appointment.update(target.id, { checks: [...kept, check], checked_at: now });
        return Response.json({ ok: true, check });
      }
      for (const r of rows) {
        if (!checksOf(r).some((c: any) => String(c.day || '') === day)) continue;
        await db.Appointment.update(r.id, { checks: checksOf(r).filter((c: any) => String(c.day || '') !== day), checked_at: now });
      }
      return Response.json({ ok: true, unchecked: true });
    }

    // Who has it now, on any copy.
    const holder = rows.map((r) => claimOn(r, day)).find(Boolean) || null;
    // Someone who has since left the family doesn't hold anything.
    const people = await familyUsers(db, familyId);
    const stillHere = (uid: string) => people.some((p: any) => p.id === uid);

    if (action === 'take') {
      if (holder && holder.user_id === user.id) return Response.json({ ok: true, claim: holder, already: true });
      if (holder && stillHere(holder.user_id)) return Response.json({ ok: false, error: 'taken', claim: holder }, { status: 409 });
      const claim = { day, user_id: user.id, name, at: now };
      const kept = pruneClaims(claimsOf(target).filter((c) => String(c.day || '') !== day), today);
      await table.update(target.id, { claims: [...kept, claim], claim_changed_at: now });
      // A left-behind claim from someone who left, on a copy: cleared.
      for (const r of rows.slice(1)) {
        if (claimOn(r, day)) await db.Appointment.update(r.id, { claims: claimsOf(r).filter((c) => String(c.day || '') !== day), claim_changed_at: now });
      }
      await tellAdder(db, people, target, kind, user, name, 'take', date || target.date || target.once_date || '', tz);
      return Response.json({ ok: true, claim });
    }

    // Let go: only your own.
    if (!holder) return Response.json({ ok: true, released: false });
    if (holder.user_id !== user.id) return Response.json({ ok: false, error: 'not_yours', claim: holder }, { status: 403 });
    for (const r of rows) {
      const mine = claimsOf(r).filter((c) => String(c.day || '') === day && c.user_id === user.id);
      if (!mine.length) continue;
      await table.update(r.id, { claims: pruneClaims(claimsOf(r).filter((c) => !(String(c.day || '') === day && c.user_id === user.id)), today), claim_changed_at: now });
    }
    await tellAdder(db, people, target, kind, user, name, 'release', date || target.date || target.once_date || '', tz);
    return Response.json({ ok: true, released: true });
  } catch (e) {
    console.error('[claimItem]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

/** The person who added it hears who's taking it (or that it's open again). */
async function tellAdder(db: any, people: any[], row: any, kind: string, user: any, name: string, action: 'take' | 'release', date: string, tz: string) {
  const adderId = kind === 'event' ? (row.created_by_user_id || row.created_by_id) : (row.owner_user_id || row.created_by_id);
  if (!adderId || adderId === user.id) return;
  const adder = people.find((p: any) => p.id === adderId);
  if (!adder || !wantsPush(adder, 'family_events')) return;
  if (kind === 'event' && !canSee(row, adder.id)) return;
  const title = kind === 'event' ? String(row.title || 'An event') : String(row.medication_name || 'A reminder');
  const forWhom = row.family_member_name ? ` for ${first(row.family_member_name)}` : '';
  const when = kind === 'event'
    ? whenText(date || row.date, row.time, row.timezone || tz, !!row.all_day)
    : (DAY.test(date) && !['Once', 'One time'].includes(row.frequency) ? whenText(date, '', tz, true) : '');
  const what = `${title}${forWhom}${when ? ` · ${when}` : ''}`;
  const r = await sendPush({
    email: adder.email,
    title: action === 'take' ? `${first(name)} will take it` : `${first(name)} can't take it anymore`,
    message: action === 'take' ? what : `${what} is open again.`,
    data: kind === 'event'
      ? { type: 'claim', appointmentId: row.id, date: date || row.date, screen: '/calendar' }
      : { type: 'claim', reminderId: row.id, screen: '/tasks' },
  });
  console.log('[claimItem] told', adder.email, action, JSON.stringify(r));
}

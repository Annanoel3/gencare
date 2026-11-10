import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { canSee } from '../../shared/sharing.ts';
import { expandAppointments } from '../../shared/recurrence.ts';
import { mergeSameEvents } from '../../shared/eventMerge.ts';
import { eventHighlightHex, PRIVATE_HEX } from '../../shared/eventColors.ts';
import { shownTitle } from '../../shared/eventTitle.ts';
import { familyUsers } from '../../shared/push.ts';
import { accessOf } from '../../shared/access.ts';
import { carePeople, buttonsFor, matchesQuick, quickRowFor, dayIn } from '../../shared/careQuick.ts';

// What GenCare's home-screen widgets show (Day, Week and Month, on Android
// and iPhone; Anna, Oct 30 2026). The widgets refresh on their own, with the
// app closed, so they can't use the app's sign-in. Each phone gets its own
// widget key instead: read-only, good for this person's calendar and nothing
// else, and dropped when they sign out on that phone. Only a hash of it is
// stored (User.widget_keys).
//
//   { mode: "key" }                 signed in  -> { ok, key }   a new key for this phone
//   { mode: "forget", key }         signed in  -> { ok }        signing out on this phone
//   { key, from, to }               no sign-in -> { ok, at, days: { "YYYY-MM-DD": [event...] } }
//
// An event: { id, t: title, s: "HH:MM" start or "", e: end, a: all day,
// c: "#hex" color or "" for plain text (not care-related), p: only you see
// it, w: who it's for (or whose it is), n: "Day 2 of 3" for a multi-day one,
// d: checked off for that day }.
// The same event on two calendars comes once, the way the app shows it.
//
// The Care Log widget (Anna, Nov 10 2026: "a log widget. It should work for
// any type of care and be sorted accordingly by the app") uses the same key,
// which can also add a one-tap Care Log entry as this person and take back
// one they added in the last 15 minutes. Nothing else.
//
//   { key, mode: "care" }                      -> { ok, people }   (shared/careQuick.ts carePeople)
//   { key, mode: "log", member_id, button }    -> { ok, id, i, l, at, already?, people }
//   { key, mode: "unlog", id }                 -> { ok, people }
// A button that needs details (how much, what happened) isn't logged here:
// the widget opens the app on it instead.

const MAX_DAYS = 62;
const KEEP_KEYS = 6;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newKey() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayCount = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const first = (s: unknown) => String(s || '').trim().split(/\s+/)[0] || '';

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const mode = String(body.mode || 'feed');

  try {
    if (mode === 'key' || mode === 'forget') {
      let me: any = null;
      try { me = await base44.auth.me(); } catch (_) { me = null; }
      if (!me?.id) return Response.json({ ok: false, error: 'Sign in first' }, { status: 401 });
      const user = (await db.User.filter({ id: me.id }))?.[0] || me;
      const keys: string[] = Array.isArray(user.widget_keys) ? user.widget_keys.map(String) : [];
      if (mode === 'forget') {
        const h = body.key ? await sha256(String(body.key)) : '';
        if (h && keys.includes(h)) await db.User.update(user.id, { widget_keys: keys.filter((k) => k !== h) });
        return Response.json({ ok: true });
      }
      const key = newKey();
      await db.User.update(user.id, { widget_keys: [await sha256(key), ...keys].slice(0, KEEP_KEYS) });
      return Response.json({ ok: true, key });
    }

    const key = String(body.key || '');
    if (key.length < 32) return Response.json({ ok: false, error: 'no_key' }, { status: 401 });

    if (mode === 'care' || mode === 'log' || mode === 'unlog') {
      const user = (await db.User.filter({ widget_keys: await sha256(key) }))?.[0];
      if (!user?.id) return Response.json({ ok: false, error: 'no_key' }, { status: 401 });
      const familyId = user.family_id;
      if (!familyId) return Response.json({ ok: true, people: [] });
      const family = (await db.Family.filter({ id: familyId }))?.[0];
      if (!accessOf(family, user).access) return Response.json({ ok: false, error: 'no_access' });
      const tz = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: user.timezone || '' }); return String(user.timezone); } catch (_) { return 'America/Chicago'; } })();
      const now = new Date();
      const members = (await db.FamilyMember.filter({ family_id: familyId })) || [];
      const recent = async () => ((await db.CareLog.filter({ family_id: familyId, timestamp: { $gte: new Date(now.getTime() - 14 * 86400000).toISOString() } }, '-timestamp', 1000)) || []).filter((l: any) => l.entry_type !== 'legal');
      let out: Record<string, unknown> = { ok: true };

      if (mode === 'log') {
        const member = members.find((m: any) => String(m.id) === String(body.member_id || ''));
        if (!member) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
        const q = buttonsFor(member, now).find((b) => b.key === String(body.button || ''));
        if (!q || q.ask) return Response.json({ ok: false, error: 'needs_app' }, { status: 400 });
        // A once-a-day one (breakfast, a shower) already logged today isn't logged twice.
        if (q.daily) {
          const today = dayIn(tz, now);
          const done = ((await recent()) as any[]).find((l) => l.family_member_id === member.id && matchesQuick(q, l) && dayIn(tz, new Date(l.timestamp)) === today);
          if (done) out = { ok: true, already: true, id: done.id, i: q.icon, l: q.label, at: done.timestamp, by: first(done.logged_by_name) };
        }
        if (!out.id) {
          const made = await db.CareLog.create(quickRowFor(q, member, user, now));
          out = { ok: true, id: made?.id, i: q.icon, l: q.label, at: now.toISOString() };
        }
      } else if (mode === 'unlog') {
        const row = (await db.CareLog.filter({ id: String(body.id || '') }))?.[0];
        const fresh = row && now.getTime() - Date.parse(String(row.timestamp || '')) < 15 * 60000;
        if (!row || row.family_id !== familyId || row.logged_by_user_id !== user.id || !fresh) return Response.json({ ok: false, error: 'cant_undo' }, { status: 400 });
        await db.CareLog.delete(row.id);
      }
      out.people = carePeople(members, await recent(), tz, now);
      out.at = out.at || now.toISOString();
      return Response.json(out);
    }

    // The feed.
    const from = String(body.from || ''), to = String(body.to || '');
    if (!isDay(from) || !isDay(to) || dayCount(from, to) < 0 || dayCount(from, to) > MAX_DAYS) {
      return Response.json({ ok: false, error: 'bad_range' }, { status: 400 });
    }
    const user = (await db.User.filter({ widget_keys: await sha256(key) }))?.[0];
    if (!user?.id) return Response.json({ ok: false, error: 'no_key' }, { status: 401 });
    const familyId = user.family_id;
    if (!familyId) return Response.json({ ok: true, at: new Date().toISOString(), days: {} });
    const family = (await db.Family.filter({ id: familyId }))?.[0];
    if (!accessOf(family, user).access) return Response.json({ ok: false, error: 'no_access' });

    const E = db.Appointment;
    const [dated, series, spans, members, accounts] = await Promise.all([
      E.filter({ family_id: familyId, date: { $gte: from, $lte: to } }, 'date', 3000),
      E.filter({ family_id: familyId, recurrence: { $regex: 'FREQ=' }, date: { $lt: from } }, '-date', 1000),
      E.filter({ family_id: familyId, date: { $lt: from }, end_date: { $gte: from } }, '-date', 500),
      db.FamilyMember.filter({ family_id: familyId }),
      familyUsers(db, familyId),
    ]);
    const byId = new Map<string, any>();
    for (const r of [...(dated || []), ...(series || []), ...(spans || [])]) if (r?.id && canSee(r, user.id)) byId.set(r.id, r);
    const shown = mergeSameEvents([...byId.values()]);
    const occ = expandAppointments(shown, from, to);

    const days: Record<string, any[]> = {};
    for (const a of occ) {
      const poster = a.created_by_user_id && a.created_by_user_id !== user.id ? first(a.created_by_name) : '';
      const c = eventHighlightHex(a, members || [], accounts || []);
      // Checked off on To-do that day (the widget fades it, like the app).
      const day = a.recurrence ? String(a.date || '') : '';
      const done = (Array.isArray(a.checks) ? a.checks : []).some((x: any) => x?.user_id && String(x.day || '') === day);
      const item = {
        id: String(a.occurrence_of || a.id),
        // As the calendar shows it: the visit's emoji, and no "Mom" in front
        // when the chip is in that person's color (Anna, Nov 9-10 2026).
        t: shownTitle(a, members || [], !!c && c !== PRIVATE_HEX),
        s: a.all_day ? '' : String(a.time || '').slice(0, 5),
        e: a.all_day ? '' : String(a.end_time || '').slice(0, 5),
        a: !!a.all_day || !a.time,
        c,
        d: done,
        p: a.visibility === 'private',
        w: first(a.family_member_name) || (a.visibility !== 'private' ? poster : ''),
        n: a.span_days > 1 ? `Day ${a.span_index + 1} of ${a.span_days}` : '',
      };
      (days[a.date] = days[a.date] || []).push(item);
    }
    for (const d of Object.keys(days)) {
      days[d].sort((x, y) => (x.a === y.a ? 0 : x.a ? -1 : 1) || x.s.localeCompare(y.s) || x.t.localeCompare(y.t));
    }
    return Response.json({ ok: true, at: new Date().toISOString(), days });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message || 'failed' }, { status: 500 });
  }
});

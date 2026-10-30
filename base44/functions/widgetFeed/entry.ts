import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { canSee } from '../../shared/sharing.ts';
import { expandAppointments } from '../../shared/recurrence.ts';
import { mergeSameEvents } from '../../shared/eventMerge.ts';
import { eventHighlightHex } from '../../shared/eventColors.ts';
import { familyUsers } from '../../shared/push.ts';
import { accessOf } from '../../shared/access.ts';

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
// it, w: who it's for (or whose it is), n: "Day 2 of 3" for a multi-day one }.
// The same event on two calendars comes once, the way the app shows it.

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

    // The feed.
    const key = String(body.key || '');
    if (key.length < 32) return Response.json({ ok: false, error: 'no_key' }, { status: 401 });
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
      const item = {
        id: String(a.occurrence_of || a.id),
        t: String(a.title || ''),
        s: a.all_day ? '' : String(a.time || '').slice(0, 5),
        e: a.all_day ? '' : String(a.end_time || '').slice(0, 5),
        a: !!a.all_day || !a.time,
        c: eventHighlightHex(a, members || [], accounts || []),
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

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict, parseISO, isValid, format, subDays } from 'date-fns';
import { Activity, CheckCircle2, BellRing, BellPlus, CalendarPlus, MessageCircle, Smartphone, UserPlus, Hand, FileText } from 'lucide-react';
import { serverDate, serverMs } from '@/lib/serverTime';
import { listReminders, REMINDERS_KEY, fmtClock, ONE_TIME } from '@/lib/reminders';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { MESSAGES_KEY, listMessages } from '@/lib/messages';
import useEventEditor from '@/components/calendar/useEventEditor';
import { plugin } from '@/lib/phone';
import { claimsOf } from '@/lib/claims';

// Home's "Who did what" (Anna, Oct 29 2026: the old Recent Activity only
// repeated the newest messages). The last 3 days of what people in the
// family actually did: who took on what ("I'll take it"), tasks checked off, reminders marked
// done, reminders and events added, messages written, events brought in
// from someone's phone calendar (one line per person: how many, counting
// ones only they see) and people joining. Only what each person is allowed to
// see shows (the database's own sharing rules), and the locked Legal &
// financial folder never does. It checks again each time Home opens and each
// time the app comes back to the front, not on a timer (Anna, Oct 30 2026: it
// wasn't updating; then "refresh on every open", every minute was a waste).

const first = (s) => String(s || '').trim().split(' ')[0];
const DAYS = 3;
// Base44's own timestamps are UTC without a Z (see serverTime.js).
const when = (iso) => {
  const d = serverDate(iso);
  if (!d) return '';
  return Date.now() - d.getTime() < 60000 ? 'just now' : formatDistanceToNowStrict(d, { addSuffix: true });
};

export default function ActivityFeed({ members = [] }) {
  const navigate = useNavigate();
  const { me, members: users = [] } = useFamily();
  const [more, setMore] = useState(false);
  const { openEvent, editor } = useEventEditor(members);
  const since = subDays(new Date(), DAYS).toISOString();
  const live = { refetchOnMount: 'always', refetchOnWindowFocus: 'always' };
  // The app coming back to the front doesn't always count as "focus" inside
  // it, so the phone's own "app is open again" signal checks too.
  const qc = useQueryClient();
  useEffect(() => {
    let handle = null;
    let gone = false;
    (async () => {
      try {
        const App = plugin('App');
        if (!App?.addListener) return;
        const h = await App.addListener('appStateChange', (st) => {
          if (!st?.isActive) return;
          qc.refetchQueries({ type: 'active', predicate: ({ queryKey: k }) => k[1] === 'activity' || (k.length === 1 && [MESSAGES_KEY[0], REMINDERS_KEY[0]].includes(k[0])) });
        });
        if (gone) h?.remove?.(); else handle = h;
      } catch (e) { /* not in the app */ }
    })();
    return () => { gone = true; try { handle?.remove?.(); } catch (e) { /* fine */ } };
  }, [qc]);

  const done = useQuery({ queryKey: ['careTasks', 'activity'], queryFn: () => base44.entities.CareTask.filter({ status: 'completed', completed_at: { $gte: since } }, '-completed_at', 40), ...live });
  const rems = useQuery({ queryKey: ['medLogs', 'activity'], queryFn: () => base44.entities.MedicationLog.filter({ status: { $in: ['taken', 'skipped'] }, taken_at: { $gte: since } }, '-taken_at', 40), ...live });
  const events = useQuery({ queryKey: ['appointments', 'activity'], queryFn: () => base44.entities.Appointment.filter({ source: 'app', created_date: { $gte: since } }, '-created_date', 40), ...live });
  const imports = useQuery({ queryKey: ['appointments', 'activity', 'phone'], queryFn: () => base44.entities.Appointment.filter({ source: 'phone', created_date: { $gte: since } }, '-created_date', 300), ...live });
  // The real totals (private events counted, never shown): what the line
  // says someone brought in, with how many of them the viewer can see.
  const importTotals = useQuery({
    queryKey: ['appointments', 'activity', 'phone-totals'],
    queryFn: () => base44.functions.invoke('phoneCalendar', { mode: 'activity', since }).then((r) => (r?.data || r)?.people || []),
    ...live,
  });
  // "I'll take it" on events and reminders in the last few days.
  const claimedEvents = useQuery({ queryKey: ['appointments', 'activity', 'claims'], queryFn: () => base44.entities.Appointment.filter({ claim_changed_at: { $gte: since } }, '-claim_changed_at', 40), ...live });
  const claimedReminders = useQuery({ queryKey: ['reminders', 'activity', 'claims'], queryFn: () => base44.entities.Medication.filter({ claim_changed_at: { $gte: since } }, '-claim_changed_at', 40), ...live });
  // Visit notes someone shared (only the ones shared with this person show).
  const sharedNotes = useQuery({ queryKey: ['notes', 'activity'], queryFn: () => base44.entities.NoteRecording.filter({ shared_at: { $gte: since } }, '-shared_at', 20), ...live });
  const msgs = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages, ...live });
  // Reminders: the same list the To-do page keeps, so adding one updates this too.
  const meds = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders, ...live });

  const who = (name, id) => (id && id === me?.id ? 'You' : first(name) || 'Someone');

  const items = useMemo(() => {
    const out = [];
    for (const t of done.data || []) {
      if (t.parent_task_id) continue;
      out.push({ key: `t${t.id}`, at: t.completed_at, icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        text: <><b>{who(t.completed_by_name, t.completed_by_user_id)}</b> checked off {t.title}</>, go: () => navigate('/tasks?tab=done') });
    }
    for (const r of rems.data || []) {
      out.push({ key: `r${r.id}`, at: r.taken_at, icon: <BellRing className="w-4 h-4 text-primary" />,
        text: <><b>{who(r.taken_by_name, r.taken_by_user_id)}</b> {r.status === 'skipped' ? 'skipped' : 'did'} {r.medication_name}{r.family_member_name ? <> for <b>{first(r.family_member_name)}</b></> : null}</>, go: () => navigate(`/tasks?highlight=${r.medication_id}`) });
    }
    for (const a of events.data || []) {
      if (a.cover_of || a.away_of) continue; // GenCare's own stand-ins ("Anna traveling")
      const day = a.date ? parseISO(a.date) : null;
      out.push({ key: `a${a.id}`, at: a.created_date, icon: <CalendarPlus className="w-4 h-4 text-violet-600" />,
        text: <><b>{who(a.created_by_name, a.created_by_user_id)}</b> added {a.title}{day && isValid(day) ? ` · ${format(day, 'EEE, MMM d')}` : ''}</>, go: () => openEvent(a) });
    }
    // Events brought in from a phone calendar: one line per person ("Pamela's
    // phone calendar brought in 18 events · 1 shared with the family"). The
    // total counts their private ones too (Anna, Oct 30 2026: it only counted
    // what she could see); how many the family sees comes from what this
    // person can see.
    const seen = new Map();
    for (const a of imports.data || []) {
      if (a.cover_of || a.away_of) continue;
      const by = a.created_by_user_id || a.created_by_id;
      const g = seen.get(by) || { n: 0, shared: 0, at: a.created_date, name: a.created_by_name };
      g.n++;
      if (a.visibility !== 'private') g.shared++;
      if (serverMs(a.created_date) > serverMs(g.at)) g.at = a.created_date;
      seen.set(by, g);
    }
    const totals = new Map((importTotals.data || []).map((p) => [p.user_id, p]));
    for (const by of new Set([...seen.keys(), ...totals.keys()])) {
      const s = seen.get(by) || { n: 0, shared: 0, at: '', name: '' };
      const t = totals.get(by);
      const total = Math.max(t?.total || 0, s.n);
      if (!total) continue;
      const mine = by === me?.id;
      const name = s.name || t?.name || '';
      const at = [s.at, t?.latest].filter(Boolean).sort((x, y) => serverMs(y) - serverMs(x))[0];
      const sharedNote = mine ? (s.shared < total ? ` · ${s.shared} shared with the family` : '') : (s.n < total ? ` · ${s.n} shared with you` : '');
      out.push({ key: `p${by}`, at, icon: <Smartphone className="w-4 h-4 text-violet-600" />,
        text: <>{mine ? <b>Your</b> : <b>{first(name) || 'Someone'}'s</b>} phone calendar brought in {total} event{total === 1 ? '' : 's'}<span className="text-muted-foreground">{sharedNote}</span></>, go: () => navigate('/calendar') });
    }
    // "I'll take it": "Robert took on Pamela's PT · Tue, Nov 3".
    const dayText = (d) => { const x = d ? parseISO(d) : null; return x && isValid(x) ? ` · ${format(x, 'EEE, MMM d')}` : ''; };
    for (const a of claimedEvents.data || []) {
      for (const c of claimsOf(a)) {
        if (serverMs(c.at) < serverMs(since)) continue;
        out.push({ key: `c${a.id}${c.day}`, at: c.at, icon: <Hand className="w-4 h-4 text-emerald-600" />,
          text: <><b>{who(c.name, c.user_id)}</b> took on {a.title}{dayText(c.day || a.date)}</>, go: () => navigate(`/calendar?date=${c.day || a.date}&event=${a.id}`) });
      }
    }
    for (const r of claimedReminders.data || []) {
      for (const c of claimsOf(r)) {
        if (serverMs(c.at) < serverMs(since)) continue;
        out.push({ key: `k${r.id}${c.day}`, at: c.at, icon: <Hand className="w-4 h-4 text-emerald-600" />,
          text: <><b>{who(c.name, c.user_id)}</b> took on {r.medication_name}{r.family_member_name ? <> for <b>{first(r.family_member_name)}</b></> : null}{dayText(c.day)}</>, go: () => navigate(`/tasks?highlight=${r.id}`) });
      }
    }
    for (const n of sharedNotes.data || []) {
      if (n.parent_record_id) continue;
      const by = users.find((u) => u.id === n.user_id);
      out.push({ key: `s${n.id}`, at: n.shared_at, icon: <FileText className="w-4 h-4 text-primary" />,
        text: <><b>{who(by?.display_name || by?.full_name, n.user_id)}</b> shared notes: {n.title || n.notes?.title || 'a recording'}{n.family_member_name ? <> about <b>{first(n.family_member_name)}</b></> : null}</>, go: () => navigate(`/notes?open=${n.id}`) });
    }
    // Someone new in the family.
    for (const u of users) {
      if (!u.created_date || u.id === me?.id || serverMs(u.created_date) < serverMs(since)) continue;
      out.push({ key: `u${u.id}`, at: u.created_date, icon: <UserPlus className="w-4 h-4 text-emerald-600" />,
        text: <><b>{first(u.full_name)}</b> joined the family</>, go: () => navigate('/family') });
    }
    // A reminder someone added ("Anna added a reminder: Order Thanksgiving food").
    for (const r of meds.data || []) {
      if (serverMs(r.created_date) < serverMs(since)) continue;
      const by = r.owner_user_id || r.created_by_id;
      const u = users.find((x) => x.id === by);
      if (!u) continue; // made by GenCare itself (samples), not a person
      const how = r.frequency === 'Once' ? " (until it's done)" : r.frequency === ONE_TIME && r.times?.[0] ? ` for ${fmtClock(r.times[0])}` : '';
      out.push({ key: `n${r.id}`, at: r.created_date, icon: <BellPlus className="w-4 h-4 text-primary" />,
        text: <><b>{who(u.display_name || u.full_name, u.id)}</b> added a reminder: {r.medication_name}{how}{r.family_member_name ? <> for <b>{first(r.family_member_name)}</b></> : null}{r.visibility === 'private' ? ' (just you)' : ''}</>, go: () => navigate(`/tasks?highlight=${r.id}`) });
    }
    for (const m of (msgs.data || []).filter((x) => !x.parent_id && serverMs(x.created_date) >= serverMs(since))) {
      out.push({ key: `m${m.id}`, at: m.created_date, icon: <MessageCircle className="w-4 h-4 text-blue-600" />,
        text: <><b>{who(m.author_name, m.author_user_id)}</b> wrote: <span className="text-muted-foreground">{m.content}</span></>, go: () => navigate('/messages') });
    }
    return out.filter((x) => x.at).sort((a, b) => serverMs(b.at) - serverMs(a.at));
  }, [done.data, rems.data, events.data, claimedEvents.data, claimedReminders.data, sharedNotes.data, imports.data, importTotals.data, msgs.data, meds.data, users, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = [done, rems, events].some((q) => q.isLoading);
  const shown = more ? items.slice(0, 40) : items.slice(0, 8);

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-2"><Activity className="w-5 h-5 text-primary" /> Who did what</h2>
      {loading && !items.length ? <p className="text-sm text-muted-foreground py-4">Loading…</p>
        : !items.length ? <p className="text-sm text-muted-foreground py-3">Nothing in the last {DAYS} days yet. When someone checks off a task, does a reminder or adds an event, it shows up here.</p>
        : (
          <ul className="divide-y divide-border/40">
            {shown.map((it) => (
              <li key={it.key}>
                <button type="button" onClick={it.go} className="w-full text-left flex items-start gap-3 py-2.5">
                  <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">{it.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm line-clamp-2">{it.text}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{when(it.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {!more && items.length > 8 && <button type="button" onClick={() => setMore(true)} className="w-full text-sm text-primary font-medium pt-2">Show more</button>}
      {editor}
    </section>
  );
}

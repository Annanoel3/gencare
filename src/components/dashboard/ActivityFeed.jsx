import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict, parseISO, isValid, format, subDays } from 'date-fns';
import { Activity, CheckCircle2, BellRing, BellPlus, CalendarPlus, MessageCircle, Smartphone, UserPlus } from 'lucide-react';
import { serverDate, serverMs } from '@/lib/serverTime';
import { listReminders, REMINDERS_KEY, fmtClock, ONE_TIME } from '@/lib/reminders';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { MESSAGES_KEY, listMessages } from '@/lib/messages';
import { summarize, isLocked } from '@/lib/careLog';
import useEventEditor from '@/components/calendar/useEventEditor';

// Home's "Who did what" (Anna, Oct 29 2026: the old Recent Activity only
// repeated the newest messages). The last 3 days of what people in the
// family actually did: care logged, tasks checked off, reminders marked
// done, reminders and events added, messages written, events brought in
// from someone's phone calendar (one line per person per day, not one per
// event) and people joining. Only what each person is allowed to see shows
// (the database's own sharing rules), and the locked Legal & financial folder
// never does. It checks again every minute while open and whenever the app
// comes back to the front (Anna, Oct 30 2026: it wasn't updating).

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
  const live = { refetchOnWindowFocus: true, refetchInterval: 60000 };

  const logs = useQuery({ queryKey: ['careLog', 'activity'], queryFn: () => base44.entities.CareLog.filter({ created_date: { $gte: since } }, '-created_date', 60), ...live });
  const done = useQuery({ queryKey: ['careTasks', 'activity'], queryFn: () => base44.entities.CareTask.filter({ status: 'completed', completed_at: { $gte: since } }, '-completed_at', 40), ...live });
  const rems = useQuery({ queryKey: ['medLogs', 'activity'], queryFn: () => base44.entities.MedicationLog.filter({ status: { $in: ['taken', 'skipped'] }, taken_at: { $gte: since } }, '-taken_at', 40), ...live });
  const events = useQuery({ queryKey: ['appointments', 'activity'], queryFn: () => base44.entities.Appointment.filter({ source: 'app', created_date: { $gte: since } }, '-created_date', 40), ...live });
  const imports = useQuery({ queryKey: ['appointments', 'activity', 'phone'], queryFn: () => base44.entities.Appointment.filter({ source: 'phone', created_date: { $gte: since } }, '-created_date', 300), ...live });
  const msgs = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages, ...live });
  // Reminders: the same list the To-do page keeps, so adding one updates this too.
  const meds = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders, ...live });

  const who = (name, id) => (id && id === me?.id ? 'You' : first(name) || 'Someone');

  const items = useMemo(() => {
    const out = [];
    for (const e of logs.data || []) {
      if (isLocked(e)) continue;
      const s = summarize(e);
      const forWhom = first(e.family_member_name);
      const actor = who(e.logged_by_name, e.logged_by_user_id);
      const self = forWhom && forWhom === first(e.logged_by_name);
      out.push({ key: `l${e.id}`, at: e.created_date || e.timestamp, icon: <span className="text-base leading-none">{s.icon}</span>,
        text: <><b>{actor}</b> logged {s.label}{!self && forWhom ? <> for <b>{forWhom}</b></> : null}</>, go: () => navigate(`/care-log?for=${e.family_member_id}`) });
    }
    for (const t of done.data || []) {
      if (t.parent_task_id) continue;
      out.push({ key: `t${t.id}`, at: t.completed_at, icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
        text: <><b>{who(t.completed_by_name, t.completed_by_user_id)}</b> checked off {t.title}</>, go: () => navigate('/tasks?tab=done') });
    }
    for (const r of rems.data || []) {
      out.push({ key: `r${r.id}`, at: r.taken_at, icon: <BellRing className="w-4 h-4 text-primary" />,
        text: <><b>{who(r.taken_by_name, r.taken_by_user_id)}</b> {r.status === 'skipped' ? 'skipped' : 'did'} {r.medication_name}{r.family_member_name ? <> for <b>{first(r.family_member_name)}</b></> : null}</>, go: () => navigate('/tasks?tab=reminders') });
    }
    for (const a of events.data || []) {
      if (a.cover_of || a.away_of) continue; // GenCare's own stand-ins ("Anna traveling")
      const day = a.date ? parseISO(a.date) : null;
      out.push({ key: `a${a.id}`, at: a.created_date, icon: <CalendarPlus className="w-4 h-4 text-violet-600" />,
        text: <><b>{who(a.created_by_name, a.created_by_user_id)}</b> added {a.title}{day && isValid(day) ? ` · ${format(day, 'EEE, MMM d')}` : ''}</>, go: () => openEvent(a) });
    }
    // Events brought in from a phone calendar: one line per person per day
    // ("Pamela brought in 6 events from her phone calendar").
    const brought = new Map();
    for (const a of imports.data || []) {
      if (a.cover_of || a.away_of) continue;
      const d = serverDate(a.created_date);
      if (!d) continue;
      const k = `${a.created_by_user_id || a.created_by_id}|${format(d, 'yyyy-MM-dd')}`;
      const g = brought.get(k) || { n: 0, at: a.created_date, by: a.created_by_user_id || a.created_by_id, name: a.created_by_name };
      g.n++;
      if (serverMs(a.created_date) > serverMs(g.at)) g.at = a.created_date;
      brought.set(k, g);
    }
    for (const [k, g] of brought) {
      const mine = g.by && g.by === me?.id;
      out.push({ key: `p${k}`, at: g.at, icon: <Smartphone className="w-4 h-4 text-violet-600" />,
        text: <><b>{who(g.name, g.by)}</b> brought in {g.n} event{g.n === 1 ? '' : 's'} from {mine ? 'your' : 'their'} phone calendar</>, go: () => navigate('/calendar') });
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
        text: <><b>{who(u.display_name || u.full_name, u.id)}</b> added a reminder: {r.medication_name}{how}{r.family_member_name ? <> for <b>{first(r.family_member_name)}</b></> : null}{r.visibility === 'private' ? ' (just you)' : ''}</>, go: () => navigate(`/tasks?reminder=${r.id}`) });
    }
    for (const m of (msgs.data || []).filter((x) => !x.parent_id && serverMs(x.created_date) >= serverMs(since))) {
      out.push({ key: `m${m.id}`, at: m.created_date, icon: <MessageCircle className="w-4 h-4 text-blue-600" />,
        text: <><b>{who(m.author_name, m.author_user_id)}</b> wrote: <span className="text-muted-foreground">{m.content}</span></>, go: () => navigate('/messages') });
    }
    return out.filter((x) => x.at).sort((a, b) => serverMs(b.at) - serverMs(a.at));
  }, [logs.data, done.data, rems.data, events.data, imports.data, msgs.data, meds.data, users, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = [logs, done, rems, events].some((q) => q.isLoading);
  const shown = more ? items.slice(0, 40) : items.slice(0, 8);

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-2"><Activity className="w-5 h-5 text-primary" /> Who did what</h2>
      {loading && !items.length ? <p className="text-sm text-muted-foreground py-4">Loading…</p>
        : !items.length ? <p className="text-sm text-muted-foreground py-3">Nothing in the last {DAYS} days yet. When someone checks off a task, logs a meal or adds an event, it shows up here.</p>
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

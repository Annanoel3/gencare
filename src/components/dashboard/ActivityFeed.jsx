import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict, parseISO, isValid, format, subDays } from 'date-fns';
import { Activity, CheckCircle2, BellRing, CalendarPlus, MessageCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { MESSAGES_KEY, listMessages } from '@/lib/messages';
import { summarize, isLocked } from '@/lib/careLog';
import useEventEditor from '@/components/calendar/useEventEditor';

// Home's "Who did what" (Anna, Oct 29 2026: the old Recent Activity only
// repeated the newest messages). The last 3 days of what people in the
// family actually did: care logged, tasks checked off, reminders marked
// done, events added, messages written. Only what each person is allowed to
// see shows (the database's own sharing rules), and the locked
// Legal & financial folder never does.

const first = (s) => String(s || '').trim().split(' ')[0];
const DAYS = 3;
const when = (iso) => {
  const d = iso ? parseISO(iso) : null;
  if (!d || !isValid(d)) return '';
  return Date.now() - d.getTime() < 60000 ? 'just now' : formatDistanceToNowStrict(d, { addSuffix: true });
};

export default function ActivityFeed({ members = [] }) {
  const navigate = useNavigate();
  const { me } = useFamily();
  const [more, setMore] = useState(false);
  const { openEvent, editor } = useEventEditor(members);
  const since = subDays(new Date(), DAYS).toISOString();

  const logs = useQuery({ queryKey: ['careLog', 'activity'], queryFn: () => base44.entities.CareLog.filter({ created_date: { $gte: since } }, '-created_date', 60) });
  const done = useQuery({ queryKey: ['careTasks', 'activity'], queryFn: () => base44.entities.CareTask.filter({ status: 'completed', completed_at: { $gte: since } }, '-completed_at', 40) });
  const rems = useQuery({ queryKey: ['medLogs', 'activity'], queryFn: () => base44.entities.MedicationLog.filter({ status: { $in: ['taken', 'skipped'] }, taken_at: { $gte: since } }, '-taken_at', 40) });
  const events = useQuery({ queryKey: ['appointments', 'activity'], queryFn: () => base44.entities.Appointment.filter({ source: 'app', created_date: { $gte: since } }, '-created_date', 40) });
  const msgs = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages });

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
    for (const m of (msgs.data || []).filter((x) => !x.parent_id && x.created_date >= since)) {
      out.push({ key: `m${m.id}`, at: m.created_date, icon: <MessageCircle className="w-4 h-4 text-blue-600" />,
        text: <><b>{who(m.author_name, m.author_user_id)}</b> wrote: <span className="text-muted-foreground">{m.content}</span></>, go: () => navigate('/messages') });
    }
    return out.filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [logs.data, done.data, rems.data, events.data, msgs.data, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = [logs, done, rems, events].some((q) => q.isLoading);
  const shown = more ? items.slice(0, 40) : items.slice(0, 8);

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-2"><Activity className="w-5 h-5 text-primary" /> Who did what</h2>
      {loading && !items.length ? <p className="text-sm text-muted-foreground py-4">Loading…</p>
        : !items.length ? <p className="text-sm text-muted-foreground py-3">Nothing in the last {DAYS} days yet. When someone checks off a task, logs Mom's lunch or adds an event, it shows up here.</p>
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

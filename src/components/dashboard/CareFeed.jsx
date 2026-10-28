import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseISO, isToday, format, isValid } from 'date-fns';
import { getMemberLightColorByMemberId } from '@/utils/memberColors';
import { expandAppointments } from '@/lib/occurrences';
import { summarize } from '@/lib/careLog';

function toWhen(entry) {
  if (entry.timestamp) { const d = parseISO(entry.timestamp); if (isValid(d)) return d; }
  if (entry.date) { const d = parseISO(entry.date); if (isValid(d)) return d; }
  return null;
}

function normalizeLog(entry) {
  const { label, detail } = summarize(entry);
  return {
    id: entry.id,
    memberId: entry.family_member_id,
    memberName: entry.family_member_name,
    label,
    detail,
    when: toWhen(entry),
    href: `/care-log?for=${entry.family_member_id}`,
  };
}

export default function CareFeed({ members = [], memberId, scope = 'today', limit = 15, title }) {
  const logQ = useQuery({ queryKey: ['careLog', 'feed'], queryFn: () => base44.entities.CareLog.list('-timestamp', 300) });
  const apptQ = useQuery({ queryKey: ['appointments', 'feed'], queryFn: () => base44.entities.Appointment.list('-date', 100) });

  const taskQ = useQuery({ queryKey: ['careTasks', 'feed'], queryFn: () => base44.entities.CareTask.filter({ status: { $in: ['pending', 'in_progress'] } }, '-due_date', 100) });

  const isLoading = [logQ, apptQ, taskQ].some(q => q.isLoading);

  let items = [];
  (logQ.data || []).forEach(e => items.push(normalizeLog(e)));
  // Repeating / multi-day events count on each day they land on (today, or the last 30 days for 'recent').
  const apptRows = scope === 'today' ? expandAppointments(apptQ.data || [], new Date(), new Date()) : expandAppointments(apptQ.data || [], new Date(Date.now() - 30 * 86400000), new Date(Date.now() + 30 * 86400000));
  apptRows.forEach(a => {
    let when = a.date ? parseISO(a.date) : null;
    if (when && isValid(when) && a.time) { const [h, m] = a.time.split(':'); when.setHours(+h, +(m || 0)); }
    items.push({
      id: a.id,
      memberId: a.family_member_id,
      memberName: a.family_member_name,
      label: 'Appointment',
      detail: [a.title, a.time, a.category].filter(Boolean).join(' · '),
      when,
    });
  });

  (taskQ.data || []).filter(t => !t.parent_task_id).forEach(t => {
    let when = t.due_date ? parseISO(t.due_date) : null;
    if (when && isValid(when) && t.due_time) { const [h, m] = t.due_time.split(':'); when.setHours(+h, +(m || 0)); }
    items.push({
      id: t.id,
      memberId: t.family_member_id,
      memberName: t.family_member_name,
      label: 'Task',
      detail: [t.title, t.assigned_to && `→ ${t.assigned_to}`].filter(Boolean).join(' · '),
      when,
    });
  });

  if (memberId) items = items.filter(i => i.memberId === memberId);
  if (scope === 'today') items = items.filter(i => i.when && isToday(i.when));
  items.sort((a, b) => (b.when ? b.when.getTime() : 0) - (a.when ? a.when.getTime() : 0));
  if (scope === 'recent') items = items.slice(0, limit);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading care activity…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 p-6">
        {title && <h3 className="font-heading text-lg font-semibold mb-2">{title}</h3>}
        <p className="text-sm text-muted-foreground text-center py-6">
          {scope === 'today' ? 'Nothing scheduled or logged today.' : 'No recent care activity.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
      {title && <h3 className="font-heading text-lg font-semibold mb-4">{title}</h3>}
      <div className="space-y-2">
        {items.map(i => (
          <div key={i.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${getMemberLightColorByMemberId(i.memberId, members)}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {i.memberName || 'Family'} <span className="text-muted-foreground font-normal">· {i.label}</span>
              </p>
              {i.detail && <p className="text-xs text-muted-foreground truncate">{i.detail}</p>}
            </div>
            {i.when && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {scope === 'today' ? format(i.when, 'h:mm a') : format(i.when, 'MMM d')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
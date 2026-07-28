import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseISO, isToday, format, isValid } from 'date-fns';
import { getMemberColorByMemberId } from '@/utils/memberColors';

function toWhen(entry) {
  if (entry.timestamp) { const d = parseISO(entry.timestamp); if (isValid(d)) return d; }
  if (entry.date) { const d = parseISO(entry.date); if (isValid(d)) return d; }
  return null;
}

function normalizeLog(entry, kind) {
  const raw = (entry.entry_type || kind).replace(/_/g, ' ');
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  const detail = [entry.sub_type?.replace(/_/g, ' '), entry.title].filter(Boolean).join(' · ');
  return {
    id: entry.id,
    memberId: entry.family_member_id,
    memberName: entry.family_member_name,
    label,
    detail,
    when: toWhen(entry),
  };
}

export default function CareFeed({ members = [], memberId, scope = 'today', limit = 15, title }) {
  const babyQ = useQuery({ queryKey: ['BabyCareLog', 'feed'], queryFn: () => base44.entities.BabyCareLog.list('-timestamp', 200) });
  const toddlerQ = useQuery({ queryKey: ['ToddlerCareLog', 'feed'], queryFn: () => base44.entities.ToddlerCareLog.list('-timestamp', 200) });
  const schoolQ = useQuery({ queryKey: ['SchoolAgeLog', 'feed'], queryFn: () => base44.entities.SchoolAgeLog.list('-timestamp', 200) });
  const preteenQ = useQuery({ queryKey: ['PreteenLog', 'feed'], queryFn: () => base44.entities.PreteenLog.list('-timestamp', 200) });
  const teenQ = useQuery({ queryKey: ['TeenLog', 'feed'], queryFn: () => base44.entities.TeenLog.list('-timestamp', 200) });
  const seniorQ = useQuery({ queryKey: ['SeniorLog', 'feed'], queryFn: () => base44.entities.SeniorLog.list('-timestamp', 200) });
  const apptQ = useQuery({ queryKey: ['appointments', 'feed'], queryFn: () => base44.entities.Appointment.list('-date', 100) });

  const isLoading = [babyQ, toddlerQ, schoolQ, preteenQ, teenQ, seniorQ, apptQ].some(q => q.isLoading);

  let items = [];
  (babyQ.data || []).forEach(e => items.push(normalizeLog(e, 'baby care')));
  (toddlerQ.data || []).forEach(e => items.push(normalizeLog(e, 'toddler care')));
  (schoolQ.data || []).forEach(e => items.push(normalizeLog(e, 'school-age')));
  (preteenQ.data || []).forEach(e => items.push(normalizeLog(e, 'pre-teen')));
  (teenQ.data || []).forEach(e => items.push(normalizeLog(e, 'teen')));
  (seniorQ.data || []).forEach(e => items.push(normalizeLog(e, 'senior')));
  (apptQ.data || []).forEach(a => {
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
          {scope === 'today' ? 'No care activity logged today.' : 'No recent care activity.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
      {title && <h3 className="font-heading text-lg font-semibold mb-4">{title}</h3>}
      <div className="space-y-2">
        {items.map(i => (
          <div key={i.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getMemberColorByMemberId(i.memberId, members)}`} />
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
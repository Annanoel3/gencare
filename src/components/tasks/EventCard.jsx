import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isValid } from 'date-fns';
import { CalendarDays, Lock, Users, Repeat, Mic } from 'lucide-react';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import { rowIdOf, repeatLabel } from '@/lib/occurrences';
import { categoryOf, isRecordable } from '@/components/calendar/EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * An event on the Tasks page, next to the day's tasks. Nothing to tick: tap
 * opens it on the calendar (where it can be shared or given a "For").
 */
export default function EventCard({ appt, members = [], showDay = false }) {
  const navigate = useNavigate();
  const canRecord = usePluginPresent('RecorderBridge');
  const id = rowIdOf(appt);
  const color = appt.family_member_id ? getMemberColorByMemberId(appt.family_member_id, members) : null;
  const tint = appt.family_member_id ? getMemberLightColorByMemberId(appt.family_member_id, members) : 'bg-card';
  const day = appt.date ? parseISO(appt.date) : null;
  const clock = appt.all_day || !appt.time ? 'All day' : `${fmtTime(appt.time)}${appt.end_time ? ` – ${fmtTime(appt.end_time)}` : ''}`;
  const when = [showDay && day && isValid(day) ? format(day, 'EEE, MMM d') : '', clock].filter(Boolean).join(' · ');
  const cat = categoryOf(appt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/calendar?date=${appt.date}&open=${id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/calendar?date=${appt.date}&open=${id}`); }}
      className={`relative overflow-hidden rounded-2xl ${tint} border border-border/50 cursor-pointer`}
    >
      {color && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug">{appt.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {appt.family_member_name && <span className="inline-flex items-center gap-1">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{appt.family_member_name}</span>}
            <span>{when}</span>
            {appt.span_days > 1 && <span>Day {appt.span_index + 1} of {appt.span_days}</span>}
            {cat && cat !== 'Other' && <span>{cat}</span>}
            {appt.recurrence && <span className="inline-flex items-center gap-0.5"><Repeat className="w-3 h-3" />{repeatLabel(appt.recurrence)}</span>}
            {appt.visibility === 'private' && <span className="inline-flex items-center gap-0.5"><Lock className="w-3 h-3" />Only you</span>}
            {appt.visibility === 'some' && <span className="inline-flex items-center gap-0.5"><Users className="w-3 h-3" />Shared</span>}
            {appt.location && <span className="truncate max-w-[12rem]">📍 {appt.location}</span>}
          </div>
        </div>
        {canRecord && isRecordable(appt) && (
          <Link
            to={`/notes?appointment=${id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700 flex-shrink-0"
          >
            <Mic className="w-3 h-3" /> {appt.notes_record_id ? 'Notes' : 'Record'}
          </Link>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import AddressLink from '@/components/shared/AddressLink';
import { Lock, Smartphone, Mic, Repeat, Users } from 'lucide-react';
import { getMemberColorByMemberId, getEventColorClass } from '@/utils/memberColors';
import { useFamily } from '@/lib/family';
import { usePluginPresent } from '@/components/shared/usePluginPresent';

// Event categories. 'Doctor' and 'Therapy' were categories before Oct 2026;
// any row still carrying one reads as a plain Appointment.
export const CATEGORIES = ['Appointment', 'School', 'Work', 'Sports', 'Social', 'Other'];
export function categoryOf(appt) {
  const c = appt?.category || '';
  return c === 'Doctor' || c === 'Therapy' ? 'Appointment' : c;
}
// Events worth recording notes at: an appointment, a school or work meeting.
export const RECORDABLE = ['Appointment', 'School', 'Work'];
export function isRecordable(appt) {
  return !!appt && RECORDABLE.includes(categoryOf(appt));
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function EventRow({ appt, members, onClick }) {
  const canRecord = usePluginPresent('RecorderBridge');
  const { members: accounts } = useFamily();
  const color = getEventColorClass(appt, members, accounts);
  const memberDot = getMemberColorByMemberId(appt.family_member_id, members);
  const poster = String(appt.created_by_name || '').split(' ')[0];
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick ? () => onClick(appt) : undefined}
      className={`flex items-start gap-3 p-3 rounded-xl bg-muted/50 ${onClick ? 'cursor-pointer hover:bg-muted active:bg-muted' : ''}`}
    >
      <div className={`w-2 self-stretch min-h-[40px] rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="font-medium text-sm flex-1 min-w-0">{appt.title}</p>
          {appt.visibility === 'private' && <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-label="Only you see this" />}
          {appt.visibility === 'some' && <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-label="Shared with certain people" />}
          {appt.source === 'phone' && <Smartphone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-label="From a phone calendar" />}
          {appt.recurrence && <Repeat className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-label="Repeats" />}
        </div>
        <div className="flex flex-wrap gap-2 mt-1 items-center">
          {appt.span_days > 1 && <span className="text-xs text-muted-foreground">Day {appt.span_index + 1} of {appt.span_days}</span>}
          {appt.all_day ? (
            <span className="text-xs text-muted-foreground">All day</span>
          ) : appt.time ? (
            <span className="text-xs text-muted-foreground">
              {fmtTime(appt.time)}{appt.end_time ? ` – ${fmtTime(appt.end_time)}` : ''}
            </span>
          ) : null}
          {appt.family_member_name ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className={`w-2 h-2 rounded-full ${memberDot}`} />
              {appt.family_member_name}
            </span>
          ) : appt.visibility !== 'private' && poster ? (
            // About nobody the app knows (a trip, their own plans): whose it is.
            <span className="inline-flex items-center gap-1 text-xs">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {poster}
            </span>
          ) : null}
          {appt.category && categoryOf(appt) !== 'Other' && <span className="text-xs text-muted-foreground">{categoryOf(appt)}</span>}
          {appt.location && <AddressLink address={appt.location} className="inline-flex items-center gap-1 text-xs text-primary max-w-full min-w-0" />}
          {canRecord && isRecordable(appt) && (
            <Link
              to={`/notes?appointment=${appt.occurrence_of || appt.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700"
            >
              <Mic className="w-3 h-3" /> {appt.notes_record_id ? 'Notes' : 'Record notes'}
            </Link>
          )}
        </div>
        {appt.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{appt.notes}</p>}
        {appt.also_from?.length > 0 && (
          // The same event was on someone else's calendar too (lib/sameEvent).
          <p className="text-xs text-muted-foreground mt-1">Also on {appt.also_from.join(' and ')}'s calendar</p>
        )}
      </div>
    </div>
  );
}

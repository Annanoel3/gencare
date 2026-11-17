import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isToday, isTomorrow, parseISO, startOfDay } from 'date-fns';
import { Mic } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { expandAppointments } from '@/lib/occurrences';
import { realEvent } from '@/lib/sameEvent';
import { useNow } from '@/lib/eventTiming';
import { checkOn } from '@/lib/claims';
import { time12 } from '@/lib/tasks';
import { shownTitle } from '@/lib/eventTitle';
import { notesLink, isNotesOf } from '@/lib/visits';
import { categoryOf } from '@/components/calendar/EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import ConsentNote from '@/components/notes/ConsentNote';
import HomeSection from '@/components/dashboard/HomeSection';
import { getMemberColorByMemberId, isCareEvent } from '@/utils/memberColors';

// Upcoming visits to record (Anna, Nov 16 2026: "Make a thing for upcoming
// things to record. (Only doctors appointments etc). So a user knows the
// option exists and has an easy way to press record"). Doctor-type visits
// (an Appointment that's care: doctor, dentist, therapy, vet...) from today
// through the next two days, each with a Record button. Close to the visit
// (an hour before until it's over) Record starts recording right away;
// earlier it opens the visit's Record Notes page, where the family can add
// questions and press Start recording. Only on phones that can record.
// Not here: someone else's private appointment (the family's "Mom: doctor"
// stand-in), ones already checked off, and ones already recorded.

const HOUR = 60 * 60 * 1000;
const DAYS_AHEAD = 2;
const MAX_SHOWN = 3;

// When a visit starts and when it's over: its end time, or three hours after
// it starts (waiting rooms run late). All day: the whole day.
function span(a) {
  const day = parseISO(a.date);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(a.time || ''));
  if (a.all_day || !t) return { start: day.getTime(), end: addDays(day, 1).getTime(), allDay: true };
  const start = new Date(`${a.date}T${t[1].padStart(2, '0')}:${t[2]}:00`).getTime();
  const e = /^(\d{1,2}):(\d{2})/.exec(String(a.end_time || ''));
  const end = e ? new Date(`${a.date}T${e[1].padStart(2, '0')}:${e[2]}:00`).getTime() : NaN;
  return { start, end: end > start ? end : start + 3 * HOUR, allDay: false };
}

function dayWord(d) {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEEE');
}

export default function RecordVisitsCard({ appointments = [], members = [] }) {
  const canRecord = usePluginPresent('RecorderBridge');
  const now = useNow();
  const today = format(now, 'yyyy-MM-dd');

  // Recordings started today or later, to leave out the visits already recorded.
  const { data: records = [] } = useQuery({
    queryKey: ['noteRecordings', 'since', today],
    queryFn: () => base44.entities.NoteRecording.filter({ started_at: { $gte: startOfDay(now).toISOString() } }, '-started_at', 100),
    enabled: canRecord,
  });

  const visits = useMemo(() => {
    if (!canRecord) return [];
    const rows = (appointments || [])
      .filter((a) => !a.cover_of)
      // Their own private appointment by its own name; "done" on any copy still counts.
      .map((a) => (a.own ? { ...realEvent(a), checks: a.checks, claims: a.claims } : a))
      .filter((a) => categoryOf(a) === 'Appointment' && isCareEvent(a, members));
    return expandAppointments(rows, now, addDays(now, DAYS_AHEAD))
      .filter((a) => !a.span_index)
      .map((a) => ({ a, ...span(a) }))
      .filter(({ a, end }) => end > now.getTime()
        && !checkOn(a, a.date)
        && !(!a.recurrence && a.notes_record_id)
        && !records.some((r) => isNotesOf(r, a, a.date)))
      .sort((x, y) => x.start - y.start);
  }, [canRecord, appointments, members, records, now]);

  if (!visits.length) return null;
  const shown = visits.slice(0, MAX_SHOWN);
  // Close to the visit: Record starts right away, and the section opens by itself.
  const isReady = ({ a, start, end, allDay }) => (allDay ? isToday(parseISO(a.date)) : now.getTime() >= start - HOUR && now.getTime() < end);

  return (
    <HomeSection
      id="record"
      title="Record a visit"
      icon={<Mic className="w-5 h-5 text-red-600 flex-shrink-0" />}
      count={visits.length}
      openNow={visits.some(isReady)}
      note="GenCare can record the visit and write up notes for the family."
    >
      <p className="text-sm text-muted-foreground mb-2">GenCare can record the visit and write up notes for the family.</p>
      <div className="divide-y divide-border/60">
        {shown.map((v) => {
          const { a, allDay } = v;
          const color = a.family_member_id ? getMemberColorByMemberId(a.family_member_id, members) : null;
          const ready = isReady(v);
          return (
            // With big text the button moves under the words instead of squeezing them.
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium title-fit">{shownTitle(a, members, !!a.family_member_name)}</p>
                <p className="text-xs text-muted-foreground">
                  {a.family_member_name && <span className="inline-flex items-center gap-1 mr-2">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{a.family_member_name.split(' ')[0]}</span>}
                  <span className="whitespace-nowrap">{dayWord(parseISO(a.date))}{allDay ? '' : ` ${time12(a.time)}`}</span>
                </p>
              </div>
              <Link
                to={notesLink(a, { record: ready })}
                aria-label={`Record ${a.title}`}
                className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex-shrink-0"
              >
                <Mic className="w-4 h-4" /> Record
              </Link>
            </div>
          );
        })}
      </div>
      {visits.length > MAX_SHOWN && <div className="text-right pt-1"><Link to="/notes" className="text-sm text-primary hover:underline">All of them ({visits.length})</Link></div>}
      <div className="mt-2"><ConsentNote /></div>
    </HomeSection>
  );
}

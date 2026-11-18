import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isToday, isTomorrow, parseISO, startOfDay } from 'date-fns';
import { Mic, CalendarClock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { expandAppointments } from '@/lib/occurrences';
import { realEvent } from '@/lib/sameEvent';
import { eventTiming, useNow } from '@/lib/eventTiming';
import { checkOn } from '@/lib/claims';
import { time12 } from '@/lib/tasks';
import { shownTitle } from '@/lib/eventTitle';
import { notesLink, isNotesOf } from '@/lib/visits';
import { categoryOf } from '@/components/calendar/EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import ConsentNote from '@/components/notes/ConsentNote';
import { getMemberColorByMemberId, isCareEvent } from '@/utils/memberColors';

// The family's next appointment, with a Record button (Anna, Nov 16 2026:
// "Make a thing for upcoming things to record... So a user knows the option
// exists and has an easy way to press record"; Nov 18 2026: just one, "your
// next appointment, and that's where you can click record"). The soonest
// doctor-type visit (an Appointment that's care: doctor, dentist, therapy,
// vet...) in the next two weeks. A push offers to record each one shortly
// before it starts (functions/cronReminders). Close to the visit
// (from an hour before) Record starts recording right away;
// earlier it opens the visit's Record Notes page, where the family can add
// questions and press Start recording. Only on phones that can record.
// Not here: someone else's private appointment (the family's "Mom: doctor"
// stand-in), ones already checked off or recorded, and ones that are over
// (the same "Past" as Today Across the Family: their end time, or an hour
// after they start).

const HOUR = 60 * 60 * 1000;
const DAYS_AHEAD = 14;

// When a visit starts (all day: the start of its day).
function startOf(a) {
  const day = parseISO(a.date);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(a.time || ''));
  if (a.all_day || !t) return { start: day.getTime(), allDay: true };
  return { start: new Date(`${a.date}T${t[1].padStart(2, '0')}:${t[2]}:00`).getTime(), allDay: false };
}

function dayWord(d, now) {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return d.getTime() - now.getTime() < 6 * 24 * HOUR ? format(d, 'EEEE') : format(d, 'EEE, MMM d');
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
      .map((a) => ({ a, ...startOf(a) }))
      // Over (the same "Past" as Today Across the Family): not a visit to record any more.
      .filter(({ a }) => eventTiming(a, now) !== 'past'
        && !checkOn(a, a.date)
        && !(!a.recurrence && a.notes_record_id)
        && !records.some((r) => isNotesOf(r, a, a.date)))
      .sort((x, y) => x.start - y.start);
  }, [canRecord, appointments, members, records, now]);

  if (!visits.length) return null;
  // Close to the visit, Record starts right away.
  const isReady = ({ a, start, allDay }) => (allDay ? isToday(parseISO(a.date)) : now.getTime() >= start - HOUR);

  // One visit's line: what, who, when, and the Record button.
  const row = (v) => {
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
            <span className="whitespace-nowrap">{dayWord(parseISO(a.date), now)}{allDay ? '' : ` ${time12(a.time)}`}</span>
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
  };

  // One visit, always open: nothing to expand.
  return (
    <div className="bg-card rounded-2xl border border-border/50 mb-6 p-4 md:px-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-primary flex-shrink-0" />
        <h2 className="font-heading text-lg font-semibold min-w-0">Next appointment</h2>
      </div>
      {row(visits[0])}
      <p className="text-xs text-muted-foreground mb-1.5">Tap Record and GenCare writes up notes from the visit for the family.</p>
      <ConsentNote />
    </div>
  );
}

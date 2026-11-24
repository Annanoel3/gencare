import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isToday, isTomorrow, parseISO, startOfDay } from 'date-fns';
import { Mic, FileCheck2, ChevronRight } from 'lucide-react';
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
import RecordingRow, { ToRecordMark } from '@/components/notes/RecordingRow';
import { useFamily } from '@/lib/family';
import { topLevel } from '@/lib/recordings';
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
//
// One card with the newest recordings under it (Anna, Nov 23 2026: "What do
// you think about combining this? And just making the difference between
// something to be recorded vs something already recorded really apparent"):
// "To record" in red with a microphone, "Already recorded" in green with a
// notes mark. Nothing shows until there's one or the other.

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
  const navigate = useNavigate();
  const { me, members: accounts = [] } = useFamily();
  const canRecord = usePluginPresent('RecorderBridge');
  // The two newest recordings (any phone or the website).
  const { data: latestRows = [] } = useQuery({
    queryKey: ['noteRecordings', 'latest', ''],
    queryFn: async () => (await base44.entities.NoteRecording.filter({}, '-started_at', 8)) || [],
  });
  const latest = topLevel(latestRows).slice(0, 2);
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

  if (!visits.length && !latest.length) return null;
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
        <ToRecordMark />
        <div className="flex-1 min-w-[9rem]">
          <p className="text-sm font-medium title-fit">{shownTitle(a, members, !!a.family_member_name)}</p>
          <p className="text-xs text-muted-foreground">
            {a.family_member_name && <span className="inline-flex items-center gap-1 mr-2">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{a.family_member_name.split(' ')[0]}</span>}
            <span className="whitespace-nowrap">{dayWord(parseISO(a.date), now)}{allDay ? '' : ` ${time12(a.time)}`}</span>
          </p>
          <p className="text-xs font-semibold text-red-700 dark:text-red-300">Not recorded yet</p>
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
  const label = (tone, Icon, text) => (
    <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tone === 'red' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
      <Icon className="w-4 h-4" /> {text}
    </p>
  );

  return (
    <div className="bg-card rounded-2xl border border-border/50 mb-6 p-4 md:px-6 space-y-3" data-guide="home-recordings">
      <div className="flex items-center gap-2">
        <Mic className="w-5 h-5 text-primary flex-shrink-0" />
        <h2 className="font-heading text-lg font-semibold min-w-0">Recordings</h2>
      </div>
      {visits.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/5 p-3">
          {label('red', Mic, 'To record: next appointment')}
          {row(visits[0])}
          <p className="text-xs text-muted-foreground mb-1.5">Tap Record and GenCare writes up notes from the visit for the family.</p>
          <ConsentNote />
        </div>
      )}
      {latest.length > 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-3 space-y-2">
          {label('green', FileCheck2, 'Already recorded')}
          {latest.map((r) => (
            <RecordingRow key={r.id} r={r} me={me} accounts={accounts} compact onOpen={(x) => navigate(`/notes?open=${x.id}`)} />
          ))}
          <Link to="/recordings?show=recorded" data-guide="home-recordings-all" className="flex items-center justify-center gap-1 h-11 rounded-xl border border-border bg-card text-base font-semibold text-primary hover:bg-muted">
            See all recordings <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      )}
    </div>
  );
}

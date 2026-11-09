import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import AddressLink from '@/components/shared/AddressLink';
import { format, parseISO, isValid } from 'date-fns';
import { Lock, Users, Repeat, Mic, Check, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/activity';
import { checkOn, setCheck, firstName } from '@/lib/claims';
import { getMemberColorByMemberId, getEventColorClass, getEventLightColorClass, isCareEvent } from '@/utils/memberColors';
import { useFamily } from '@/lib/family';
import { rowIdOf, repeatLabel } from '@/lib/occurrences';
import { categoryOf, isRecordable } from '@/components/calendar/EventRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import ClaimButton from '@/components/shared/ClaimButton';
import { shortTitle } from '@/lib/eventTitle';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * An event on the To-do page, next to the day's reminders. The circle checks
 * it off (anyone in the family; its reminders stop), tap the rest to open
 * it, and "I'll take it" says you'll handle it.
 */
export default function EventCard({ appt, members = [], showDay = false, onOpen }) {
  const navigate = useNavigate();
  const canRecord = usePluginPresent('RecorderBridge');
  const id = rowIdOf(appt);
  const { me, members: accounts } = useFamily();
  const qc = useQueryClient();
  const color = getEventColorClass(appt, members, accounts);
  // Checked off (Anna, Nov 2 2026: "there's no way to check some of these
  // off"): for this day if it repeats, otherwise for good. Shown right away;
  // the saved answer comes back with the refetch.
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(undefined);
  const saved = checkOn(appt, appt.date);
  const check = local === undefined ? saved : local;
  const done = !!check;
  const tick = async (e) => {
    e.stopPropagation();
    if (busy) return;
    const next = !done;
    setBusy(true);
    setLocal(next ? { user_id: me?.id, name: me?.display_name || me?.full_name || '' } : null);
    try {
      await setCheck(appt, appt.date, next);
      track('action', next ? 'done:event' : 'undo:event');
    } catch (err) {
      setLocal(undefined);
      toast({ title: "Couldn't save", description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['appointments'] });
      setLocal(undefined);
    }
  };
  const doneBy = check ? (check.user_id === me?.id ? 'you' : firstName(check.name)) : '';
  // Care events get their color; the rest are plain (no bar, no tint).
  const care = isCareEvent(appt);
  const tint = appt.visibility === 'private' || !care ? 'bg-card' : getEventLightColorClass(appt, members, accounts);
  const memberDot = getMemberColorByMemberId(appt.family_member_id, members);
  const day = appt.date ? parseISO(appt.date) : null;
  const clock = appt.all_day || !appt.time ? 'All day' : `${fmtTime(appt.time)}${appt.end_time ? ` – ${fmtTime(appt.end_time)}` : ''}`;
  const when = [showDay && day && isValid(day) ? format(day, 'EEE, MMM d') : '', clock].filter(Boolean).join(' · ');
  const cat = categoryOf(appt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (onOpen ? onOpen(appt) : navigate(`/calendar?date=${appt.date}&open=${id}`))}
      onKeyDown={(e) => { if (e.key === 'Enter') { if (onOpen) onOpen(appt); else navigate(`/calendar?date=${appt.date}&open=${id}`); } }}
      className={`relative overflow-hidden rounded-2xl ${tint} border border-border/50 cursor-pointer ${done ? 'opacity-60' : ''}`}
    >
      {color && (care || appt.visibility === 'private') && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <button
          type="button"
          onClick={tick}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={busy}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? 'bg-emerald-500 border-emerald-500' : 'border-primary/40 hover:border-primary hover:bg-primary/10'}`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : done ? <Check className="w-3 h-3 text-white" /> : null}
        </button>
        <div className="flex-1 min-w-0">
          {/* Who it's for shows just below, so not in the title too. */}
          <p className={`font-medium text-sm leading-snug ${done ? 'line-through' : ''}`}>{appt.family_member_name ? shortTitle(appt, members) : appt.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {appt.family_member_name
              ? <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${memberDot}`} />{appt.family_member_name}</span>
              : appt.visibility !== 'private' && appt.created_by_name
                ? <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${color}`} />{String(appt.created_by_name).split(' ')[0]}</span>
                : null}
            <span>{when}</span>
            {appt.span_days > 1 && <span>Day {appt.span_index + 1} of {appt.span_days}</span>}
            {cat && cat !== 'Other' && <span>{cat}</span>}
            {appt.recurrence && <span className="inline-flex items-center gap-0.5"><Repeat className="w-3 h-3" />{repeatLabel(appt.recurrence)}</span>}
            {appt.visibility === 'private' && <span className="inline-flex items-center gap-0.5"><Lock className="w-3 h-3" />Only you</span>}
            {appt.visibility === 'some' && <span className="inline-flex items-center gap-0.5"><Users className="w-3 h-3" />Shared</span>}
            {done && <span>done by {doneBy || 'someone'}</span>}
            {appt.location && <AddressLink address={appt.location} className="inline-flex items-center gap-1 text-primary max-w-[14rem] min-w-0" />}
          </div>
          {appt.own && <p className="text-xs text-muted-foreground mt-1">This is "{appt.own.title}". Your family just sees "{appt.title}".</p>}
          {!done && <ClaimButton kind="event" item={appt} date={appt.date} className="mt-2" />}
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

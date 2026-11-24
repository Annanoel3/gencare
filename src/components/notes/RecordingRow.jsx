import React from 'react';
import { ChevronRight, Lock, FileCheck2, Hourglass, Mic as MicIcon } from 'lucide-react';
import { sharingLabel } from '@/components/notes/ShareNotesDialog';
import { clock, whenText, STATUS_TEXT, titleOf, firstLine } from '@/lib/recordings';

// One recording in a list (the Recordings page, Home, a person's profile).
// Tapping it opens its notes (?open=ID). Already recorded, so it looks it
// (Anna, Nov 23 2026: "making the difference between something to be recorded
// vs something already recorded really apparent"): a green notes mark, where
// what's still to record has a red microphone (ToRecordMark).
//   snippet  where a search found the words, shown instead of the first line
//   compact  one line of details, for Home and profiles

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

export default function RecordingRow({ r, me, accounts = [], events = [], snippet = null, compact = false, onOpen }) {
  const mine = !r.user_id || r.user_id === me?.id;
  const by = !mine ? accounts.find((a) => a.id === r.user_id) : null;
  const byName = firstName(by?.display_name || by?.full_name);
  const ev = r.appointment_id ? events.find((a) => a.id === r.appointment_id) : null;
  const evLabel = ev && ev.title !== titleOf(r) ? ev.title : '';
  const status = STATUS_TEXT[r.status] || '';
  const onlyMe = mine && sharingLabel(r, accounts) === 'Only me';
  const line = snippet ? null : firstLine(r);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(r)}
      data-guide="recording-row"
      className={`w-full min-w-0 text-left rounded-2xl border border-border/50 bg-card ${compact ? 'p-3' : 'p-4'} flex items-center gap-3 hover:bg-muted/50`}
    >
      <RecordedMark working={r.status === 'transcribing' || r.status === 'recording'} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold title-fit">{r.family_member_name ? `${firstName(r.family_member_name)}: ` : ''}{titleOf(r)}</div>
        <div className="text-sm text-muted-foreground">
          {whenText(r.started_at)}{!compact && r.duration_ms ? ` · ${clock(r.duration_ms)}` : ''}
          {!compact && evLabel ? ` · ${evLabel}` : ''}
          {byName ? ` · ${byName} recorded it` : ''}
          {status ? ` · ${status}` : ''}
          {onlyMe && <> · <Lock className="inline w-3 h-3 -mt-0.5" /> only me</>}
        </div>
        {snippet && <div className="text-sm mt-1 text-muted-foreground line-clamp-2"><span className="font-semibold">{snippet.where.charAt(0).toUpperCase() + snippet.where.slice(1)}:</span> {snippet.text}</div>}
        {!compact && line && <div className="text-sm mt-1 line-clamp-2">{line}</div>}
      </div>
      <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Already recorded: notes ready (green), or still being made (amber). */
export function RecordedMark({ working = false }) {
  return working ? (
    <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center shrink-0" aria-hidden="true"><Hourglass className="w-5 h-5" /></span>
  ) : (
    <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center justify-center shrink-0" aria-hidden="true"><FileCheck2 className="w-5 h-5" /></span>
  );
}

/** Still to record: a red microphone. */
export function ToRecordMark() {
  return <span className="w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300 flex items-center justify-center shrink-0" aria-hidden="true"><MicIcon /></span>;
}

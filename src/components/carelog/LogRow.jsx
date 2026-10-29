import { externalClick } from '@/lib/phone';
import React from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { summarize } from '@/lib/careLog';
import PrivateImage from '@/components/journal/PrivateImage';

/** One care-log entry in a list. Tap to edit. */
export default function LogRow({ entry, onOpen, showDate }) {
  const { icon, label, detail } = summarize(entry);
  const when = entry.timestamp ? parseISO(entry.timestamp) : null;
  const time = when && isValid(when) ? format(when, showDate ? 'MMM d · h:mm a' : 'h:mm a') : '';
  return (
    <button type="button" onClick={() => onOpen?.(entry)} className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}{detail ? <span className="text-muted-foreground font-normal"> · {detail}</span> : null}</p>
        {entry.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.notes}</p>}
        {entry.doc_url && <a href={entry.doc_url} target="_blank" rel="noreferrer" onClick={externalClick(entry.doc_url)} className="inline-flex items-center gap-1 text-xs text-primary mt-1"><ExternalLink className="w-3 h-3" /> Open document</a>}
        {Array.isArray(entry.photos) && entry.photos.length > 0 && (
          <div className="flex gap-1.5 mt-2">{entry.photos.slice(0, 4).map((u) => <PrivateImage key={u} fileUri={u} className="w-14 h-14 rounded-md object-cover border border-border/60" />)}</div>
        )}
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">{time}{entry.logged_by_name ? ` · ${entry.logged_by_name.split(' ')[0]}` : ''}</span>
    </button>
  );
}

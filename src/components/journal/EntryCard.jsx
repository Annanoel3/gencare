import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Star } from 'lucide-react';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import { categoryIcon, moodEmoji } from '@/lib/journal';
import PrivateImage from './PrivateImage';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/** One journal entry: who it's about, who wrote it, the note and any photos. */
export default function EntryCard({ entry, members = [], onOpen }) {
  const [viewing, setViewing] = useState(null);
  const color = entry.family_member_id ? getMemberColorByMemberId(entry.family_member_id, members) : null;
  const tint = entry.family_member_id ? getMemberLightColorByMemberId(entry.family_member_id, members) : 'bg-card';
  const photos = Array.isArray(entry.photos) && entry.photos.length ? entry.photos : (entry.photo_url ? [entry.photo_url] : []);
  const written = entry.created_date ? parseISO(entry.created_date) : null;
  const time = written && isValid(written) ? format(written, 'h:mm a') : '';
  const author = entry.author_name || entry.created_by_name || '';

  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl border border-border/50 ${tint}`}>
        {color && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${color}`} />}
        <button type="button" onClick={() => onOpen?.(entry)} className="w-full text-left p-4 pl-5">
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-1.5">
            {entry.family_member_name ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">{color && <span className={`w-2 h-2 rounded-full ${color}`} />}{entry.family_member_name}</span>
            ) : <span className="font-medium text-foreground">Whole family</span>}
            <span>{categoryIcon(entry.category)} {entry.category}</span>
            {entry.mood && <span className="text-base leading-none" title={entry.mood}>{moodEmoji(entry.mood)}</span>}
            {entry.is_important && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{entry.content}</p>
          <p className="text-xs text-muted-foreground mt-2">{author ? `${author.split(' ')[0]}` : ''}{author && time ? ' · ' : ''}{time}</p>
        </button>
        {photos.length > 0 && (
          <div className="flex gap-2 px-5 pb-4 overflow-x-auto">
            {photos.map((uri) => (
              <PrivateImage key={uri} fileUri={uri} className="w-24 h-24 rounded-lg object-cover border border-border/60 flex-shrink-0 cursor-zoom-in" onClick={() => setViewing(uri)} />
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-0">
          {viewing && <PrivateImage fileUri={viewing} className="max-h-[85vh] w-auto mx-auto rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

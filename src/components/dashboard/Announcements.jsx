import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Megaphone, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { track } from '@/lib/activity';
import { serverDate } from '@/lib/serverTime';
import { useNow } from '@/lib/eventTiming';
import {
  MESSAGES_KEY, listMessages, postMessage, activeAnnouncements, markAnnouncementDone, takeDownAnnouncement, ANNOUNCE_DAYS,
} from '@/lib/messages';

// Announcements at the top of Home's "Today Across the Family" (Anna, Nov 10
// 2026), and the box for posting one. See lib/messages for how long they stay.

const first = (s) => String(s || '').trim().split(' ')[0];
const ago = (iso) => {
  const d = serverDate(iso);
  if (!d) return '';
  return Date.now() - d.getTime() < 60000 ? 'just now' : formatDistanceToNowStrict(d, { addSuffix: true });
};

export function AnnouncementList() {
  const qc = useQueryClient();
  const { me, family, apply } = useFamily();
  const now = useNow();
  const { data: messages = [] } = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages, refetchInterval: 60_000, enabled: !!me });
  // Hidden here the moment Got it is tapped, whatever the account answers.
  const [hidden, setHidden] = useState([]);
  const list = activeAnnouncements(messages, me, now).filter((m) => !hidden.includes(m.id));
  const [busy, setBusy] = useState('');

  const gotIt = async (m) => {
    setBusy(m.id);
    setHidden((h) => [...h, m.id]);
    try {
      const done = await markAnnouncementDone(me, m.id);
      if (family) apply({ family, me: { ...me, announcements_done: done } });
      track('action', 'announcement: got it');
    } catch {
      setHidden((h) => h.filter((x) => x !== m.id));
      toast({ title: "Couldn't hide it", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };
  const takeDown = async (m) => {
    setBusy(m.id);
    try {
      await takeDownAnnouncement(m.id);
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      track('action', 'announcement: taken down');
      toast({ title: 'Taken down', description: "It's off everyone's Home. It's still in the Feed." });
    } catch {
      toast({ title: "Couldn't take it down", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  if (!list.length) return null;
  return (
    <div className="space-y-2 mb-3">
      {list.map((m) => {
        const mine = m.author_user_id === me?.id;
        return (
          <div key={m.id} className="rounded-2xl border border-purple-300/60 dark:border-purple-700/60 bg-purple-50 dark:bg-purple-950/40 p-3.5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{mine ? 'Your announcement' : `Announcement from ${first(m.author_name) || 'someone'}`}</span> · {ago(m.created_date)}
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <Button size="sm" variant="secondary" className="h-8 rounded-full" disabled={busy === m.id} onClick={() => gotIt(m)}>
                    {mine ? 'Hide for me' : 'Got it'}
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-8 rounded-full">
                    <Link to="/messages">Reply in the Feed</Link>
                  </Button>
                  {mine && (
                    <Button size="sm" variant="ghost" className="h-8 rounded-full text-destructive hover:text-destructive" disabled={busy === m.id} onClick={() => takeDown(m)}>
                      Take down for everyone
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DAY_LABEL = { 1: '1 day', 3: '3 days', 7: '1 week' };

export function AnnounceDialog({ open, onClose }) {
  const qc = useQueryClient();
  const { me } = useFamily();
  const [text, setText] = useState('');
  const [days, setDays] = useState(3);
  const post = useMutation({
    mutationFn: () => postMessage({ content: text, category: 'Announcement', announceDays: days }, me),
    onSuccess: () => {
      track('action', 'announcement: posted', DAY_LABEL[days]);
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      toast({ title: 'Announced', description: "It's at the top of everyone's Home, and they're getting a notification now." });
      setText(''); setDays(3);
      onClose();
    },
    onError: () => toast({ title: "Couldn't post it", description: 'Check your connection and try again.', variant: 'destructive' }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !post.isPending) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-purple-500" /> Announcement</DialogTitle>
          <DialogDescription>Everyone in the family gets a notification right away, and it stays at the top of their Home.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={500} placeholder="What does everyone need to know?" aria-label="Announcement" />
        <div>
          <p className="text-sm font-medium mb-1.5">Keep it on Home for</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Keep it on Home for">
            {ANNOUNCE_DAYS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}
                className={`h-9 px-3 rounded-full border text-sm ${days === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>
                {DAY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full h-11 rounded-xl" disabled={!text.trim() || post.isPending} onClick={() => post.mutate()}>
          {post.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : 'Announce to everyone'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

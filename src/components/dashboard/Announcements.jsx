import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, formatDistanceToNowStrict } from 'date-fns';
import { Megaphone, Loader2, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { track } from '@/lib/activity';
import { serverDate } from '@/lib/serverTime';
import { useNow } from '@/lib/eventTiming';
import {
  MESSAGES_KEY, listMessages, postMessage, activeAnnouncements, markAnnouncementDone, takeDownAnnouncement, ANNOUNCE_DAYS,
  postedAt, scheduledAnnouncements, sendAnnouncementNow, deleteMessage,
} from '@/lib/messages';

// Announcements at the top of Home's "Today Across the Family" (Anna, Nov 10
// 2026), and the box for posting one, now or at a later time ("can you make
// it so that an announcement can be set for a future time?"). See
// lib/messages for how long they stay. Later times come in quarter hours,
// which is when the server's 15-minute run sends them.

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
  const later = scheduledAnnouncements(messages, me, now).filter((m) => !hidden.includes(m.id));
  const [busy, setBusy] = useState('');
  const [canceling, setCanceling] = useState(null);

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

  const sendNow = async (m) => {
    setBusy(m.id);
    try {
      await sendAnnouncementNow(m);
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      track('action', 'announcement: sent early');
      toast({ title: 'Announced', description: "It's at the top of everyone's Home, and they're getting a notification now." });
    } catch {
      toast({ title: "Couldn't send it", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };
  const cancel = async (m) => {
    setCanceling(null);
    setBusy(m.id);
    setHidden((h) => [...h, m.id]);
    try {
      await deleteMessage(m, messages);
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      track('action', 'announcement: canceled');
      toast({ title: 'Canceled', description: "It won't go out." });
    } catch {
      setHidden((h) => h.filter((x) => x !== m.id));
      toast({ title: "Couldn't cancel it", description: 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  if (!list.length && !later.length) return null;
  return (
    <div className="space-y-2 mb-3">
      {later.map((m) => (
        <div key={m.id} className="rounded-2xl border border-dashed border-purple-300/70 dark:border-purple-700/70 p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            <span><span className="font-semibold text-foreground">Your announcement goes out {whenLater(m.announce_at)}</span> · only you can see it until then</span>
          </p>
          <p className="text-sm mt-1 whitespace-pre-wrap break-words line-clamp-3">{m.content}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button size="sm" variant="secondary" className="h-8 rounded-full" disabled={busy === m.id} onClick={() => sendNow(m)}>Send it now</Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-destructive hover:text-destructive" disabled={busy === m.id} onClick={() => setCanceling(m)}>Cancel it</Button>
          </div>
        </div>
      ))}
      <AlertDialog open={!!canceling} onOpenChange={(o) => { if (!o) setCanceling(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this announcement?</AlertDialogTitle>
            <AlertDialogDescription>It won't go out, and it's deleted. Nobody else has seen it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => canceling && cancel(canceling)}>Cancel it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                  <span className="font-semibold text-foreground">{mine ? 'Your announcement' : `Announcement from ${first(m.author_name) || 'someone'}`}</span> · {ago(postedAt(m))}
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

// "Thu, Nov 12 at 9:00 AM" ("today at", "tomorrow at" when it's that close).
function whenLater(iso) {
  const d = serverDate(iso);
  if (!d) return 'later';
  const day = format(d, 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const t = format(d, 'h:mm a');
  return day === today ? `today at ${t}` : day === tomorrow ? `tomorrow at ${t}` : `${format(d, 'EEE, MMM d')} at ${t}`;
}

// Every quarter hour of the day, "00:00" to "23:45".
const QUARTERS = [...Array(96)].map((_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const atOf = (day, time) => (day && time ? new Date(`${day}T${time}:00`) : null);

export function AnnounceDialog({ open, onClose, initialText = '', onPosted }) {
  const qc = useQueryClient();
  const { me } = useFamily();
  const [text, setText] = useState(initialText);
  const [days, setDays] = useState(3);
  const [later, setLater] = useState(false);
  const [day, setDay] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  // Opened again (from the Feed with what was typed there): start from that.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setText(initialText || ''); setDays(3); setLater(false); setDay(format(addDays(new Date(), 1), 'yyyy-MM-dd')); setTime('09:00'); }
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  // Today only offers times that haven't passed.
  const times = day === today ? QUARTERS.filter((t) => atOf(day, t).getTime() > Date.now() + 60_000) : QUARTERS;
  const at = later ? atOf(day, time) : null;
  const atOk = !later || (!!at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now() + 60_000);
  const goesOut = later && atOk ? whenLater(at.toISOString()) : '';

  const post = useMutation({
    mutationFn: () => postMessage({ content: text, category: 'Announcement', announceDays: days, announceAt: later ? at : undefined }, me),
    onSuccess: () => {
      track('action', later ? 'announcement: scheduled' : 'announcement: posted', DAY_LABEL[days]);
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      toast(later
        ? { title: 'Scheduled', description: `Everyone gets it ${goesOut}. Until then, only you can see it.` }
        : { title: 'Announced', description: "It's at the top of everyone's Home, and they're getting a notification now." });
      onPosted?.();
      onClose();
    },
    onError: () => toast({ title: "Couldn't post it", description: 'Check your connection and try again.', variant: 'destructive' }),
  });
  const chip = (on) => `h-9 px-3 rounded-full border text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !post.isPending) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-purple-500" /> Announcement</DialogTitle>
          <DialogDescription>
            {later
              ? 'Only you can see it until then. At that time, everyone gets a notification and it goes to the top of their Home.'
              : 'Everyone in the family gets a notification right away, and it stays at the top of their Home.'}
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={500} placeholder="What does everyone need to know?" aria-label="Announcement" />
        <div>
          <p className="text-sm font-medium mb-1.5">Send it</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Send it">
            <button type="button" role="radio" aria-checked={!later} onClick={() => setLater(false)} className={chip(!later)}>Now</button>
            <button type="button" role="radio" aria-checked={later} onClick={() => setLater(true)} className={chip(later)}>At a later time</button>
          </div>
          {later && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input type="date" value={day} min={today} onChange={(e) => {
                const d = e.target.value;
                setDay(d);
                // A time that's already gone today moves to the next one that isn't.
                if (d === today && atOf(d, time) && atOf(d, time).getTime() <= Date.now() + 60_000) {
                  const next = QUARTERS.find((t) => atOf(d, t).getTime() > Date.now() + 60_000);
                  if (next) setTime(next);
                }
              }} aria-label="Day" className="h-10" />
              <select value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {(times.includes(time) ? times : [time, ...times]).map((t) => <option key={t} value={t}>{clock(t)}</option>)}
              </select>
            </div>
          )}
          {later && !atOk && <p className="text-xs text-destructive mt-1.5">Pick a time that hasn't passed yet.</p>}
        </div>
        <div>
          <p className="text-sm font-medium mb-1.5">Keep it on Home for</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Keep it on Home for">
            {ANNOUNCE_DAYS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
                {DAY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full h-11 rounded-xl" disabled={!text.trim() || !atOk || post.isPending} onClick={() => post.mutate()}>
          {post.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {later ? 'Saving…' : 'Sending…'}</> : later ? (goesOut ? `Send it ${goesOut}` : 'Pick a time') : 'Announce to everyone'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

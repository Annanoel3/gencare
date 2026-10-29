import { externalClick } from '@/lib/phone';
import { track } from '@/lib/activity';
import { Link } from 'react-router-dom';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, subDays, isValid } from 'date-fns';
import { Heart, Flower2, Lock, Bell, Phone, ExternalLink, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import WellnessHistory from '@/components/wellness/WellnessHistory';
import DaySheet from '@/components/wellness/DaySheet';
import { MOODS, STRESS, SELF_CARE, isHard } from '@/lib/wellness';

// Caregiver wellness: a private daily check-in (mood, stress, sleep, what you
// did for yourself, notes), a month you can page back through where tapping a
// day shows everything from it, a burnout nudge when the last week looks
// rough, and an optional daily reminder push. Nothing here is shared with the
// family.

const TIPS = [
  'Take 5 slow breaths right now.',
  'Step outside for 5 minutes of fresh air.',
  'Drink a glass of water.',
  'Text a friend just to say hi.',
  'Put on a song you love.',
  'Stretch your neck and shoulders.',
  'Write down 3 things that went okay today.',
  "It's okay to ask for help. You don't have to do this alone.",
];
const HOURS = [7, 8, 9, 12, 15, 18, 20, 21];

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const reminderOn = (h) => Number.isInteger(h) && h >= 0 && h <= 23;

export default function Wellness() {
  const queryClient = useQueryClient();
  const { me, family, apply } = useFamily();
  const today = todayStr();
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [form, setForm] = useState({ mood: '', stress: 0, sleep_hours: '', self_care: [], note: '' });
  const [openDay, setOpenDay] = useState(null);
  const checkinRef = useRef(null);

  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const { data: checkins = [] } = useQuery({
    queryKey: ['wellnessCheckins', me?.id],
    queryFn: () => base44.entities.WellnessCheckin.filter({ user_id: me.id, day: { $gte: since } }, '-day', 60),
    enabled: !!me?.id,
  });
  const todays = checkins.find((c) => c.day === today) || null;

  useEffect(() => {
    if (todays) setForm({ mood: todays.mood || '', stress: todays.stress || 0, sleep_hours: todays.sleep_hours ?? '', self_care: todays.self_care || [], note: todays.note || '' });
  }, [todays?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      // A day can be just a note; mood is left off when none was picked.
      const row = { ...(form.mood ? { mood: form.mood } : {}), stress: form.stress || null, sleep_hours: form.sleep_hours === '' ? null : Number(form.sleep_hours), self_care: form.self_care, note: form.note.trim() };
      if (todays) return base44.entities.WellnessCheckin.update(todays.id, row);
      return base44.entities.WellnessCheckin.create({ ...row, user_id: me.id, family_id: me.family_id || family?.id || null, day: today });
    },
    onSuccess: () => { track('action', 'save:wellness check-in'); queryClient.invalidateQueries({ queryKey: ['wellnessCheckins'] }); toast({ title: 'Saved', description: 'Just for you. The family never sees this.' }); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (c) => base44.entities.WellnessCheckin.delete(c.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['wellnessCheckins'] }); setForm({ mood: '', stress: 0, sleep_hours: '', self_care: [], note: '' }); },
  });

  // Off is saved as -1: Base44 ignores a null in updateMe, so "Off" used to
  // look saved here while the server kept the old hour and still pushed.
  const setReminder = async (v) => {
    const hour = v === 'off' ? -1 : Number(v);
    try {
      await base44.auth.updateMe({ wellness_reminder_hour: hour });
      if (family) apply({ family, me: { ...me, wellness_reminder_hour: hour } });
      toast({ title: hour < 0 ? 'Reminder off' : `Reminder set for ${fmtHour(hour)}` });
    } catch (e) { toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' }); }
  };

  // Last 14 days, oldest first, for the strip; and the burnout read.
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd');
    return { day: d, c: checkins.find((x) => x.day === d) || null };
  }), [checkins]);
  const lastWeek = days.slice(7).map((d) => d.c).filter(Boolean);
  const roughDays = lastWeek.filter(isHard).length;
  const streak = (() => { let n = 0; for (let i = days.length - 1; i >= 0 && days[i].c; i--) n++; return n; })();

  const toggleCare = (s) => setForm((f) => ({ ...f, self_care: f.self_care.includes(s) ? f.self_care.filter((x) => x !== s) : [...f.self_care, s] }));

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><Heart className="w-7 h-7 text-primary" /> Your Wellness</h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private to you. Caring for someone is work; this is where you check on the carer.</p>
      </div>

      {roughDays >= 3 && (
        <Card className="mb-6 border-orange-300/60 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-5">
            <p className="font-heading font-semibold mb-1">{roughDays} of the last 7 days have been hard.</p>
            <p className="text-sm text-muted-foreground mb-3">That's a lot to carry. Burnout sneaks up on caregivers; it isn't a personal failing. A few places that exist for exactly this:</p>
            <ul className="text-sm space-y-1.5">
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Caregiver Action Network Help Desk: <a href="tel:+18552273640" className="text-primary underline">(855) 227-3640</a> ·  <a href="https://caregiveraction.org/helpdesk/" target="_blank" rel="noreferrer" onClick={externalClick('https://caregiveraction.org/helpdesk/')} className="text-primary underline inline-flex items-center gap-1">caregiveraction.org <ExternalLink className="w-3 h-3" /></a></li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> If you're in crisis in the US, call or text <a href="tel:988" className="text-primary underline">988</a> any time.</li>
              <li className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Post in Messages asking someone to take a shift. People usually want to help and don't know how.</li>
              <li className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> <Link to="/resources" className="text-primary underline">More places that help caregivers</Link></li>
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0"><Flower2 className="w-6 h-6 text-primary" /></div>
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-0.5">One small thing</p>
            <p className="font-medium">{tip}</p>
          </div>
        </CardContent>
      </Card>

      <Card ref={checkinRef} className="mb-6 border-border/50 scroll-mt-20">
        <CardHeader className="pb-3"><CardTitle className="font-heading text-lg">{todays ? "Today's check-in" : 'How are you today?'}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {MOODS.map((m) => (
              <button key={m.value} type="button" onClick={() => setForm((f) => ({ ...f, mood: m.value }))}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${form.mood === m.value ? `${m.color} shadow-sm scale-105` : 'border-border/50 hover:border-border'}`}>
                <span className="text-2xl md:text-3xl">{m.emoji}</span>
                <span className="text-xs font-medium text-center leading-tight">{m.label}</span>
              </button>
            ))}
          </div>

          {form.mood && (
            <>
              <div>
                <p className="text-sm font-medium mb-1.5">Stress</p>
                <div className="flex gap-1.5">
                  {STRESS.map((label, i) => (
                    <button key={label} type="button" onClick={() => setForm((f) => ({ ...f, stress: f.stress === i + 1 ? 0 : i + 1 }))}
                      className={`flex-1 rounded-xl border py-2 text-xs font-medium ${form.stress === i + 1 ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium mb-1.5">Sleep last night</p>
                  <div className="relative"><Input type="number" inputMode="decimal" min="0" max="16" step="0.5" value={form.sleep_hours} onChange={(e) => setForm((f) => ({ ...f, sleep_hours: e.target.value }))} placeholder="7" className="pr-12" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hours</span></div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1.5">Did anything for yourself today?</p>
                <div className="flex flex-wrap gap-1.5">
                  {SELF_CARE.map((s) => (
                    <button key={s} type="button" onClick={() => toggleCare(s)} className={`rounded-full border px-3 py-1 text-xs font-medium ${form.self_care.includes(s) ? 'bg-primary/15 border-primary text-primary' : 'bg-card border-border text-muted-foreground'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes for the day: always here, with or without a mood. */}
          <div>
            <p className="text-sm font-medium mb-1.5">Notes for today</p>
            <Textarea placeholder="Anything on your mind today. Only you see this." value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="min-h-[90px]" />
          </div>
          {(form.mood || form.note.trim() || todays) && (
            <div className="flex items-center gap-2">
              {todays && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => remove.mutate(todays)}><Trash2 className="w-4 h-4" /> Remove</Button>}
              <div className="flex-1" />
              <Button onClick={() => save.mutate()} disabled={save.isPending || (!form.mood && !form.note.trim())} className="rounded-xl">{save.isPending ? 'Saving…' : todays ? 'Update' : 'Save'}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <WellnessHistory userId={me?.id} onPick={setOpenDay} footer={streak > 1 ? <span>Streak: <b className="text-foreground">{streak} days</b></span> : null} />

      <Card className="border-border/50">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-medium flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Daily reminder</p>
            <p className="text-sm text-muted-foreground">A quiet push once a day asking how you're holding up. Skipped on days you've already checked in.</p>
          </div>
          <Select value={reminderOn(me?.wellness_reminder_hour) ? String(me.wellness_reminder_hour) : 'off'} onValueChange={setReminder}>
            <SelectTrigger className="w-[150px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{fmtHour(h)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {checkins.some((c) => c.note) && (
        <Card className="mt-6 border-border/50">
          <CardHeader className="pb-3"><CardTitle className="font-heading text-lg">Your notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checkins.filter((c) => c.note).slice(0, 10).map((c) => {
              const m = MOODS.find((x) => x.value === c.mood);
              const d = parseISO(c.day);
              return (
                <button key={c.id} type="button" onClick={() => setOpenDay({ day: c.day, c })} className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-muted/50 active:bg-muted">
                  <span className="text-xl mt-0.5">{m?.emoji || '📝'}</span>
                  <div className="flex-1 min-w-0"><p className="text-sm whitespace-pre-wrap line-clamp-3">{c.note}</p><p className="text-xs text-muted-foreground mt-1">{isValid(d) ? format(d, 'EEE, MMM d') : c.day}</p></div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <DaySheet value={openDay} onClose={() => setOpenDay(null)} onEditToday={() => checkinRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
    </div>
  );
}

function fmtHour(h) {
  return `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
}

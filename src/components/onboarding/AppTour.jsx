import React, { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarDays, BellRing, Plus, Mic, CircleHelp, Menu } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { waitForWelcome } from '@/lib/welcome';
import { track } from '@/lib/activity';

// A quick look around GenCare, one thing at a time, in big plain words (Anna,
// Nov 18 2026: "We need to make sure the older generations dont have a hard
// time. It has been so hard for my 76 yr old dad to figure out the app").
// Shows once per account, after the welcome chat; Help shows it again
// ("Take the tour"). The names in bold are the buttons as they appear.
const DONE_KEY = 'gencare_tour_done';
export const TOUR_EVENT = 'gencare-tour';
export function startTour() {
  try { window.dispatchEvent(new Event(TOUR_EVENT)); } catch (e) { /* fine */ }
}

const STEPS = [
  { icon: LayoutDashboard, title: 'Welcome to GenCare', body: <>Here's a quick look around. It takes about a minute.<br /><br /><b>Home</b> shows today: what's going on across the family, the to-do list and the next appointment.</> },
  { icon: CalendarDays, title: 'The family calendar', body: <>Tap <b>Calendar</b> at the bottom of the screen. Each person has their own color. Tap a day to see everything on it.</> },
  { icon: BellRing, title: 'Reminders', body: <>Reminders are things someone needs to do, like "Call the pharmacy." Tap <b>Reminders</b> at the bottom to see them. When one is done, tap <b>Done</b>.</> },
  { icon: Plus, title: 'Adding something', body: <>To add anything, tap the round green <b>+</b> button in the bottom right corner. Then tap <b>Event</b> for something on the calendar, or <b>Reminder</b> for something to do.</> },
  { icon: Mic, title: 'Doctor visits', body: <>At an appointment, tap the red <b>Record</b> button. GenCare listens to the visit and writes up notes for the family, so nobody has to remember it all.</> },
  { icon: CircleHelp, title: 'If you get stuck', body: <>Tap the <Menu className="inline w-5 h-5 -mt-1" aria-label="menu" /> menu at the top right, then <b>Help</b>. It shows how to do each thing, step by step.<br /><br />Words too small? In the menu, tap <b>Settings</b>, then turn on <b>Big text mode</b>.</> },
];

const doneHere = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; } };

export default function AppTour({ user: me }) {
  const [step, setStep] = useState(-1); // -1 = closed
  const [auto, setAuto] = useState(false);

  // Once per account: after the welcome chat (and its notification question) is out of the way.
  useEffect(() => {
    if (!me?.id || me.tour_done_at || doneHere()) return undefined;
    let live = true;
    waitForWelcome().then(() => setTimeout(() => { if (live) { setAuto(true); setStep(0); track('action', 'tour shown', 'first time'); } }, 1500));
    return () => { live = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Help's "Take the tour".
  useEffect(() => {
    const open = () => { setAuto(false); setStep(0); };
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  const close = (how) => {
    setStep(-1);
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* the account flag still holds */ }
    if (auto) base44.auth.updateMe({ tour_done_at: new Date().toISOString() }).catch(() => {});
    track('action', 'tour closed', how);
  };

  if (step < 0) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const Icon = s.icon;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(`skipped at ${step + 1}`); }}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] rounded-2xl [&>button]:hidden" onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"><Icon className="w-8 h-8 text-primary" aria-hidden="true" /></div>
          <DialogTitle className="font-heading text-2xl">{s.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-lg leading-relaxed text-foreground/85 mt-3">{s.body}</div>
          </DialogDescription>
          <p className="text-sm text-muted-foreground mt-4" aria-live="polite">{step + 1} of {STEPS.length}</p>
        </div>
        <div className="flex gap-2 pt-1">
          {step > 0 && <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setStep(step - 1)}>Back</Button>}
          <Button className="h-12 flex-[2] text-base" onClick={() => (last ? close('finished') : setStep(step + 1))}>{last ? 'Got it' : 'Next'}</Button>
        </div>
        {/* In a div: the window hides its own direct-child buttons (that's how its X is hidden). */}
        {!last && <div className="flex justify-center"><button type="button" onClick={() => close(`skipped at ${step + 1}`)} className="text-base text-muted-foreground underline py-2 px-3">Skip the tour</button></div>}
      </DialogContent>
    </Dialog>
  );
}

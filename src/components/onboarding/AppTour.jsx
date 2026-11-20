import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Mic } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { waitForWelcome } from '@/lib/welcome';
import { track } from '@/lib/activity';
import { plugin } from '@/lib/phone';
import { HomeScene, CalendarScene, ReminderScene, HelpScene } from '@/components/onboarding/TourScenes';
import { ADD_TOUR_EVENT, ADD_PICK_EVENT, ADD_CHOICES } from '@/components/shared/QuickCaptureButton';

// A quick look around GenCare, one thing at a time, in big plain words (Anna,
// Nov 18 2026: "We need to make sure the older generations dont have a hard
// time. It has been so hard for my 76 yr old dad to figure out the app").
// Shows once per account, after the welcome chat; Help shows it again
// ("Take the tour"). The names in bold are the buttons as they appear.
// Nov 20 2026: a little moving picture on Home, Calendar, Reminders and Help;
// the real green + stays above the tour to try; no doctor talk.
const DONE_KEY = 'gencare_tour_done';
export const TOUR_EVENT = 'gencare-tour';
export const TOUR_CLOSED_EVENT = 'gencare-tour-closed';
export function startTour() {
  try { window.dispatchEvent(new Event(TOUR_EVENT)); } catch { /* fine */ }
}
const say = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* fine */ } };

function stepsFor(canRecord) {
  return [
    { scene: HomeScene, title: 'Welcome to GenCare', body: <>Here's a quick look around. It takes about a minute.<br /><br />Tap <b>Home</b> at the bottom to see today: what's going on across the family, the to-do list and the next appointment.</> },
    { scene: CalendarScene, title: 'The family calendar', body: <>Tap <b>Calendar</b> at the bottom. Tap a day to see everything on it. Tap someone's name to see only their events.</> },
    { scene: ReminderScene, title: 'Reminders', body: <>Reminders are to-do items like "Call the pharmacy." Tap <b>Reminders</b> at the bottom, type it in the box and tap <b>+</b>. Under <b>For</b>, tap who it's for.</> },
    { add: true, title: 'Adding something' },
    canRecord && { icon: Mic, title: 'Appointments and meetings', body: <>Going to an appointment or a meeting? Tap the red <b>Record</b> button. GenCare writes up notes for the family, so nobody has to remember it all.<br /><br />It's on <b>Home</b> next to the next appointment. You can also open the menu and tap <b>Record Notes</b>.</> },
    { scene: HelpScene, title: 'If you get stuck', body: <>Tap the menu at the top right, then <b>Help</b>. Help can show you how to do things right on the screen, and answer your questions.<br /><br />Words too small? In the menu, tap <b>Settings</b>, then turn on <b>Big text mode</b>.</> },
  ].filter(Boolean);
}

const doneHere = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } };
export const tourStillToCome = (me) => !!me?.id && !me.tour_done_at && !doneHere();

// The words on "Adding something", as the person tries the real +.
function AddBody({ menu, picked }) {
  if (picked) {
    const c = ADD_CHOICES.find((x) => x.label === picked);
    return <><b>{c?.label}</b>: {c?.what}<br /><br />Tap the green <b>+</b> again to see another one, or tap <b>Next</b>.</>;
  }
  if (menu) return <>These are the things you can add. Tap one to see what it's for.</>;
  return <>To add anything, tap the round green <b>+</b> in the bottom right corner. Go ahead, try it now.</>;
}

export default function AppTour({ user: me }) {
  const [step, setStep] = useState(-1); // -1 = closed
  const [auto, setAuto] = useState(false);
  const [steps, setSteps] = useState(() => stepsFor(false));
  const [addMenu, setAddMenu] = useState(false);
  const [picked, setPicked] = useState('');

  const open = (isAuto) => {
    setSteps(stepsFor(!!plugin('RecorderBridge')));
    setAuto(isAuto);
    setStep(0);
  };

  // Once per account: after the welcome chat (and its notification question) is out of the way.
  useEffect(() => {
    if (!tourStillToCome(me)) return undefined;
    let live = true;
    waitForWelcome().then(() => setTimeout(() => { if (live) { open(true); track('action', 'tour shown', 'first time'); } }, 1500));
    return () => { live = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Help's "Take the tour".
  useEffect(() => {
    const start = () => open(false);
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, []);

  const s = step >= 0 ? steps[step] : null;
  const onAdd = !!s?.add;

  // "Adding something": the real + sits above the tour, and its choices say what they're for.
  useEffect(() => {
    if (!onAdd) return undefined;
    setAddMenu(false);
    setPicked('');
    say(ADD_TOUR_EVENT, { on: true });
    const pick = (e) => {
      if (e.detail?.open !== undefined) { setAddMenu(!!e.detail.open); if (!e.detail.open) setPicked(''); }
      if (e.detail?.label) { setPicked(e.detail.label); track('action', 'tour add tried', e.detail.label); }
    };
    window.addEventListener(ADD_PICK_EVENT, pick);
    return () => { window.removeEventListener(ADD_PICK_EVENT, pick); say(ADD_TOUR_EVENT, { on: false }); };
  }, [onAdd]);

  const close = (how) => {
    setStep(-1);
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* the account flag still holds */ }
    if (auto) base44.auth.updateMe({ tour_done_at: new Date().toISOString() }).catch(() => {});
    track('action', 'tour closed', how);
    say(TOUR_CLOSED_EVENT, { how });
  };

  if (!s) return null;
  const last = step === steps.length - 1;
  const Scene = s.scene;
  const Icon = s.icon;
  return (
    <>
      {/* The tour's own dimmed backdrop, so the green + can sit above it on "Adding something".
          In the page's top layer (like the card), so it's over the + the rest of the time. */}
      {createPortal(<div className="fixed inset-0 z-50 bg-black/80 touch-none" aria-hidden="true" />, document.body)}
      <Dialog open modal={false} onOpenChange={(o) => { if (!o) close(`skipped at ${step + 1}`); }}>
        <DialogContent
          className={`max-w-sm w-[calc(100vw-2rem)] rounded-2xl [&>button]:hidden ${onAdd ? 'sm:top-[max(0.75rem,env(safe-area-inset-top))] sm:translate-y-0 gap-3 p-5' : ''}`}
          onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <div className="flex flex-col items-center text-center pt-1">
            {Scene && <div className="mb-4 text-left"><Scene /></div>}
            {Icon && <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"><Icon className="w-8 h-8 text-primary" aria-hidden="true" /></div>}
            {onAdd && <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center mb-2" aria-hidden="true"><Plus className="w-6 h-6 text-primary-foreground" /></div>}
            <DialogTitle className="font-heading text-2xl">{s.title}</DialogTitle>
            <DialogDescription asChild>
              <div className={`text-lg leading-relaxed text-foreground/85 ${onAdd ? 'mt-1.5' : 'mt-3'}`} aria-live={onAdd ? 'polite' : undefined}>
                {onAdd ? <AddBody menu={addMenu} picked={picked} /> : s.body}
              </div>
            </DialogDescription>
            {!onAdd && <p className="text-sm text-muted-foreground mt-4" aria-live="polite">{step + 1} of {steps.length}</p>}
          </div>
          {/* Always in view, even when Big text mode makes the card scroll. */}
          <div className="sticky -bottom-6 -mx-6 px-6 pt-3 pb-6 -mb-6 bg-background z-10">
            <div className="flex gap-2">
              {step > 0 && <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setStep(step - 1)}>Back</Button>}
              <Button className="h-12 flex-[2] text-base" onClick={() => (last ? close('finished') : setStep(step + 1))}>{last ? 'Got it' : 'Next'}</Button>
            </div>
            {!last && !onAdd && <div className="flex justify-center mt-2"><button type="button" onClick={() => close(`skipped at ${step + 1}`)} className="text-base text-muted-foreground underline py-2 px-3">Skip the tour</button></div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import React, { useState } from 'react';
import { ChevronDown, CircleHelp, LifeBuoy, PlayCircle, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SupportDialog from '@/components/shared/SupportDialog';
import { startTour } from '@/components/onboarding/AppTour';

// How to do the everyday things, step by step (testers' report, Nov 2026:
// "Improved Help Sections"; Anna, Nov 18 2026: "We need to make sure the
// older generations dont have a hard time"). Big words, one step per line,
// and the button names in bold exactly as they appear on screen. Opened from
// the menu (Help) and Settings.
const M = () => <Menu className="inline w-5 h-5 -mt-1" aria-label="menu" />;

const HOW_TOS = [
  {
    id: 'event', title: 'Put something on the calendar',
    steps: [
      <>Tap <b>Calendar</b> at the bottom of the screen.</>,
      <>Tap <b>Add event</b> at the top.</>,
      <>In the box under <b>What</b>, type what it is, like "Eye doctor."</>,
      <>Under <b>When</b>, tap the day and pick it. Then tap the time and pick it.</>,
      <>Under <b>Who it's for</b>, tap the person's name.</>,
      <>Tap <b>Add</b> at the bottom.</>,
    ],
    tip: <>The round green <b>+</b> in the bottom right corner works too: tap it, then tap <b>Event</b>.</>,
  },
  {
    id: 'reminder', title: 'Add a reminder',
    steps: [
      <>Tap <b>Reminders</b> at the bottom of the screen.</>,
      <>Tap the box that says <b>Add a reminder…</b> and type it, like "Pick up prescriptions."</>,
      <>Tap the green <b>+</b> next to the box.</>,
      <>Under <b>For</b>, tap who needs to do it. Leave it on <b>Whole family</b> if anyone can.</>,
      <>Tap <b>Add</b> at the bottom.</>,
    ],
  },
  {
    id: 'done', title: 'Check something off',
    steps: [
      <>Find it on <b>Home</b> under <b>To-do</b>, or on the <b>Reminders</b> page.</>,
      <>Tap <b>Done</b>. The family sees that it's taken care of.</>,
    ],
    tip: <>Tapped it by mistake? Tap <b>Undo</b>.</>,
  },
  {
    id: 'record', title: 'Record a doctor visit',
    steps: [
      <>On <b>Home</b>, find <b>Next appointment</b> and tap the red <b>Record</b> button.</>,
      <>If it asks, tap <b>Start recording</b> when the visit begins.</>,
      <>You can lock your phone. GenCare keeps recording.</>,
      <>When the visit is over, tap <b>Stop</b>.</>,
      <>GenCare writes up the notes. Then it asks who in the family can see them.</>,
    ],
    tip: <>Ask everyone in the room first. In some states, everyone has to agree before you record. You can also open the <M /> menu and tap <b>Record Notes</b>.</>,
  },
  {
    id: 'day', title: "See what's happening on a day",
    steps: [
      <>Tap <b>Calendar</b> at the bottom of the screen.</>,
      <>Tap the day. Everything on it shows below the calendar.</>,
      <>To go back up, tap <b>Back to calendar</b>, or tap <b>Calendar</b> at the bottom again.</>,
    ],
    tip: <>Each person has their own color. Plain text, with no color, is for things that don't take anyone's time, like a cleaner's visit.</>,
  },
  {
    id: 'invite', title: 'Invite someone to the family',
    steps: [
      <>Tap <b>Family</b> at the bottom of the screen.</>,
      <>Tap <b>Invite</b>.</>,
      <>If they're next to you, they point their phone's camera at the square code. If not, tap <b>Copy code</b> and send it to them in a text.</>,
    ],
  },
  {
    id: 'bigger', title: 'Make the words bigger',
    steps: [
      <>Tap the <M /> menu at the top right.</>,
      <>Tap <b>Settings</b>.</>,
      <>Turn on <b>Big text mode</b>, at the top.</>,
    ],
  },
  {
    id: 'phone', title: "Bring in your phone's calendar",
    steps: [
      <>Tap <b>Calendar</b> at the bottom of the screen.</>,
      <>Tap <b>More</b> at the top, then <b>Get events from my phone</b>.</>,
      <>Pick which of your phone's calendars to bring in, and follow the steps.</>,
    ],
  },
];

export default function Help() {
  const [open, setOpen] = useState('');
  const [asking, setAsking] = useState(false);
  return (
    <div className="pb-24 lg:pb-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <CircleHelp className="w-7 h-7 text-primary" />
          Help
        </h1>
        <p className="text-muted-foreground mt-1 text-base">Simple steps for the things people do most. Tap one to see how.</p>
      </div>

      <Button onClick={startTour} variant="outline" className="w-full h-14 gap-2 text-base rounded-2xl mb-6 border-2 border-primary/30">
        <PlayCircle className="w-5 h-5 text-primary" /> Take the quick tour again
      </Button>

      <div className="space-y-3">
        {HOW_TOS.map((h) => {
          const isOpen = open === h.id;
          return (
            <div key={h.id} className="bg-card rounded-2xl border border-border/50">
              <button type="button" onClick={() => setOpen(isOpen ? '' : h.id)} aria-expanded={isOpen}
                className="w-full flex items-center gap-3 p-4 md:px-6 text-left min-h-[3.75rem]">
                <h2 className="flex-1 min-w-0 font-heading text-lg font-semibold">{h.title}</h2>
                <ChevronDown className={`w-6 h-6 flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="px-4 pb-5 md:px-6 -mt-1">
                  <ol className="space-y-3">
                    {h.steps.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center flex-shrink-0" aria-hidden="true">{i + 1}</span>
                        <span className="text-base leading-relaxed pt-0.5">{s}</span>
                      </li>
                    ))}
                  </ol>
                  {h.tip && <p className="text-base leading-relaxed text-muted-foreground mt-4 rounded-xl bg-muted/60 p-3">{h.tip}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6 mt-6">
        <h2 className="font-heading text-lg font-semibold">Still stuck?</h2>
        <p className="text-base text-muted-foreground mt-1 mb-4">Send a question. It goes straight to the person who makes GenCare.</p>
        <Button onClick={() => setAsking(true)} className="w-full h-12 gap-2 text-base"><LifeBuoy className="w-5 h-5" /> Ask for help</Button>
      </div>

      <SupportDialog open={asking} kind="support" onClose={() => setAsking(false)} />
    </div>
  );
}

import React from 'react';

// "Show me how" on Help (Anna, Nov 20 2026: the written steps were "just a lot
// of text and it expects the user to remember all the steps and return to the
// page they were confused about in the first place"). Each one walks the
// person through it on the real screens: GenCare lights up the next thing to
// tap and says what to do, one step at a time. components/help/GuideOverlay
// runs them; the targets are data-guide="..." on the real buttons.
//
// A step:
//   target   the data-guide name (or a list; the first one on the screen counts)
//   say      what to do
//   next     true when there's typing or picking to do: a Next button moves on
//   tapOn    only a tap on this data-guide inside the target moves on
//   optional skip it when its target isn't on the screen
//   missing  what to say when its target never shows up
//   check    after the tap, make sure the target went away (the form saved)
//   stuck    what to say when it didn't
// Steps that only say to tap something are passed over when the step after
// them is already on the screen (already on the Calendar? "Tap Calendar" is skipped).

export const GUIDE_EVENT = 'gencare-guide';
export function startGuide(id) {
  try { window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: { id } })); } catch { /* fine */ }
}

const NAV = { home: 'nav-home', reminders: 'nav-tasks', calendar: 'nav-calendar', family: 'nav-family' };

export const GUIDES = [
  {
    id: 'event', title: 'Put something on the calendar',
    steps: [
      { target: NAV.calendar, say: <>Tap <b>Calendar</b> at the bottom of the screen.</> },
      { target: 'cal-add', say: <>Tap <b>Add event</b>.</> },
      { target: 'event-what', next: true, say: <>Tap this box and type what it is, like "Lunch with Grandma." Then tap <b>Next</b>.</> },
      { target: 'event-when', next: true, say: <>Pick the day and the time. If it ends at a certain time, tap <b>Add end time</b> too. Then tap <b>Next</b>.</> },
      { target: 'event-who', next: true, optional: true, say: <>Tap who it's for. Then tap <b>Next</b>.</> },
      { target: 'event-add', check: true, say: <>Tap <b>Add</b>.</>, stuck: <>Something still needs filling in. The form says what. Fix it, then tap <b>Add</b> again.</> },
    ],
    done: <>Done! It's on the family calendar.</>,
  },
  {
    id: 'reminder', title: 'Add a reminder',
    steps: [
      { target: NAV.reminders, say: <>Tap <b>Reminders</b> at the bottom of the screen.</> },
      { target: 'rem-quick', next: true, say: <>Tap this box and type the reminder, like "Pick up the dry cleaning." Then tap <b>Next</b>.</> },
      { target: 'rem-quick-add', say: <>Tap the green <b>+</b>.</> },
      { target: 'rem-when', next: true, optional: true, say: <>Pick the day and the time. If it has to be done by a certain time, tap <b>Add end time</b> too. Then tap <b>Next</b>.</> },
      { target: 'rem-for', next: true, optional: true, say: <>Tap who needs to do it. Leave it on <b>Whole family</b> if anyone can. Then tap <b>Next</b>.</> },
      { target: 'rem-add', check: true, say: <>Tap <b>Add</b>.</>, stuck: <>Something still needs filling in. The form says what. Fix it, then tap <b>Add</b> again.</> },
    ],
    done: <>Done! It's on the Reminders list.</>,
  },
  {
    id: 'done', title: 'Check something off',
    steps: [
      { target: NAV.home, say: <>Tap <b>Home</b> at the bottom of the screen.</> },
      { target: ['home-todo', 'rem-list'], tapOn: 'todo-done', say: <>Find the one that's finished and tap <b>Done</b> next to it.</>, missing: <>There's nothing to check off right now.</> },
    ],
    done: <>Done! The family sees that it's taken care of. Tapped it by mistake? Tap <b>Undo</b>.</>,
  },
  {
    id: 'day', title: "See what's on a day",
    steps: [
      { target: NAV.calendar, say: <>Tap <b>Calendar</b> at the bottom of the screen.</> },
      { target: 'cal-month', tapOn: 'cal-day', say: <>Tap a day.</> },
      { target: 'cal-daylist', next: true, last: true, say: <>Everything on that day is here. To go back up, tap <b>Back to calendar</b>.</> },
    ],
  },
  {
    id: 'person', title: "See one person's events",
    steps: [
      { target: NAV.calendar, say: <>Tap <b>Calendar</b> at the bottom of the screen.</> },
      { target: 'cal-people', tapOn: 'cal-person', say: <>Tap someone's name. Only their events show.</>, missing: <>There's nobody else in the family yet. Add people on the <b>Family</b> page.</> },
      { target: 'cal-people', next: true, last: true, say: <>To see everyone again, tap <b>Everyone</b>.</> },
    ],
  },
  {
    id: 'record', title: 'Record an appointment or meeting',
    steps: [
      { target: 'menu', say: <>Tap the menu at the top right.</> },
      { target: 'menu-notes', say: <>Tap <b>Record Notes</b>.</> },
      { target: 'notes-start', tapOn: 'notes-record', say: <>Ask everyone there if it's OK to record. Then tap <b>Record</b>. You can type what it is in the box first.</>, missing: <>Recording works in the GenCare app on your phone.</> },
    ],
    done: <>When it's over, tap <b>Stop</b>. GenCare writes up the notes for the family.</>,
  },
  {
    id: 'invite', title: 'Invite someone to the family',
    steps: [
      { target: NAV.family, say: <>Tap <b>Family</b> at the bottom of the screen.</> },
      { target: 'family-invite', say: <>Tap <b>Invite</b>.</> },
    ],
    done: <>If they're with you, they point their phone's camera at the square code. If not, tap <b>Copy code</b> and send it to them in a text.</>,
  },
  {
    id: 'bigger', title: 'Make the words bigger',
    steps: [
      { target: 'menu', say: <>Tap the menu at the top right.</> },
      { target: 'menu-settings', say: <>Tap <b>Settings</b>.</> },
      { target: 'big-text', tapOn: 'big-text-switch', say: <>Tap the switch next to <b>Big text mode</b>.</> },
    ],
    done: <>Done! Tap the switch again any time to change it back.</>,
  },
  {
    id: 'photo', title: 'Add events from a photo',
    steps: [
      { target: NAV.calendar, say: <>Tap <b>Calendar</b> at the bottom of the screen.</> },
      { target: 'cal-more', say: <>Tap <b>More</b>.</> },
      { target: 'cal-photo', say: <>Tap <b>Add events from a photo</b>.</> },
    ],
    done: <>Tap <b>Take a photo</b> of a schedule or a flyer, or <b>Choose a photo or screenshot</b>. GenCare finds the dates, and you check them before anything is added.</>,
  },
  {
    id: 'phone', title: "Bring in your phone's calendar",
    steps: [
      { target: NAV.calendar, say: <>Tap <b>Calendar</b> at the bottom of the screen.</> },
      { target: 'cal-more', say: <>Tap <b>More</b>.</> },
      { target: 'cal-phone', say: <>Tap <b>Get events from my phone</b>.</> },
    ],
    done: <>Pick which of your phone's calendars to bring in, and follow the steps on the screen.</>,
  },
];

export const guideById = (id) => GUIDES.find((g) => g.id === id);

// What the Help chat knows about GenCare (functions/helpChat). Anna, Nov 20
// 2026: "an ai chat that knows everything about the app. No wrong info
// allowed." Every line here was checked against the app's screens when it was
// written; the chat answers only from it. When a screen changes, change its
// lines here too (the button names are the ones on screen, word for word).
//
// GUIDE_IDS: TWIN of src/components/help/guides.jsx (the "Show me how" walkthroughs).

export const GUIDE_IDS: Record<string, string> = {
  event: 'Put something on the calendar',
  reminder: 'Add a reminder',
  done: 'Check something off',
  day: "See what's on a day",
  person: "See one person's events",
  record: 'Record an appointment or meeting',
  recordings: 'Find a recording',
  invite: 'Invite someone to the family',
  bigger: 'Make the words bigger',
  photo: 'Add events from a photo',
  phone: "Bring in your phone's calendar",
};

export const APP_GUIDE = `GENCARE APP GUIDE

What GenCare is
- A family organizing app: one shared family calendar, reminders and to-dos, a family feed, a care log, recorded notes, and local help. It's for families who help take care of each other: older parents, kids, pets.
- GenCare organizes care. It is not a medical app and gives no medical advice.

Getting around
- The bar at the bottom of the screen has five buttons: Home, Reminders, Calendar, Feed, Family.
- The menu button is at the top right (three lines). The menu has: Home; Family (Feed, Calendar, Family Members); Tools (Reminders, Care Log, Recordings); Resources; Help; Settings; and Sign Out at the bottom.
- Tapping the GenCare name at the top left goes to Home.
- The round green + in the bottom right corner is on every page. Tapping it shows: Event, Events from a photo, Reminder, Announcement, Log care.

Home
- At the top: a greeting and today's date.
- "Today Across the Family": announcements first, then the family's day in order: today's events and reminders by time (each reminder has Done and Skip). Under "Still to do" are reminders that keep going until they're done and to-dos with no time. What's over is faded at the bottom, and a skipped reminder is crossed out there; done ones are gone. Then what was logged today. The Announce button there sends an announcement, and "Reminders page" opens the Reminders page.
- "Recordings": in red, "To record: next appointment" (on phones that can record): the next appointment in the next two weeks, marked "Not recorded yet", with a red Record button. In green, "Already recorded": the two newest recordings, and "See all recordings".
- "Who did what": what people in the family did lately.

Calendar
- Tap Calendar at the bottom. There are Month, Week and Day tabs.
- Each person has their own color. Plain text, with no color, is for things that don't take anyone's time, like a cleaner's visit. Gray means only you see it ("Only me").
- Tap a day to see everything on it, below the calendar. To go back up, tap Back to calendar, or tap Calendar at the bottom again.
- The names above the calendar: tap a name to see only that person's events. Tap Everyone to see all of them again. Pets shows when the family has pets.
- To add an event: tap Add event at the top of the Calendar, or the green + and then Event. Then:
  - What: type what it is (this one is required).
  - When: pick the day and the time. "Add end time" adds when it ends. The All day switch is for events with no time. Repeat lets it repeat: Every day, Weekdays, Every week, Every other week, Every month or Every year. A repeating event asks for its "Last day it repeats", or tick "Until I stop it".
  - Who it's for: tap the person.
  - Share with: Whole family, Only me, or certain people. ("Let GenCare decide" shows for people who picked that choice.)
  - Where, and Notes, if you like.
  - Tap Add.
- To change an event, tap it. Changes save on their own; tap Done when finished. An open event also has: Delete; Copy to another day; Stop repeating (on a repeating event); a "Show in color" switch; and "Record notes at this visit" on phones that can record.
- "I'll take it" on an event says you'll handle it (for a repeating event, just that day). Everyone sees who took it, and its reminder goes to them.
- Notifications: an hour before and 10 minutes before an event that has a time, GenCare sends a notification to the people in the family who can see it (or only to the person who took it). For an appointment, the 10-minute one offers to record it. If someone else already started recording that visit, the Recordings page says so (with a "Record anyway" button).
- The More button at the top of the Calendar has: Add events from a photo; Get events from my phone; Check my phone for changes now.
- Add events from a photo: tap Take a photo, or Choose a photo or screenshot, of an appointment card, a schedule or a flyer. GenCare finds the dates, and you check them before anything is added. The photo isn't saved. (Also on the green +: Events from a photo.)
- Phone calendar: More, then Get events from my phone. Pick which of your phone's calendars to bring in. It can also put family events and one-time reminders on your phone's calendar ("Send to my phone calendar"). This works in the GenCare app on your phone. The same settings are in Settings, then My Family, then Phone calendar.
- Who sees the events you add: Settings, then My Family, then "Who sees the events you add". The choices are Let GenCare decide, Everyone in the family, or Only me. Any one event can still be changed on the event.
  - Let GenCare decide: anything that takes up your time goes to everyone, under its own name, so they can plan around it. Things that don't take anyone's time, like a bill's due date, stay with you. On your own trip, the family sees "<your name> traveling" for the days you're away, and the hotel and plans while you're away stay with you; flights are shared.
  - Everyone in the family: everything you add is shared, except work meetings.
  - Only me: nothing is shared until you share it.

Reminders
- Tap Reminders at the bottom. The page shows events, reminders and things to do. Anyone in the family can tick them off. Its tabs are Reminders and Done.
- To add one: type it in the box that says "Add a reminder…" and tap the green + next to it. (With nothing typed, the + opens an empty form.) The green + in the corner, then Reminder, works too, and so does the Reminder button at the top of the page.
- The reminder form:
  - What: what to remind about (required).
  - Steps (optional): like a checklist. Anyone can tick them off, and ticking the last one marks it done.
  - How often: One time (one notification at the time you pick, and that's all), Until it's done (it keeps reminding every day until someone marks it done), Every day, or Certain days.
  - When: the day and the time. "Add end time" is for things with a window, like "pick up the dry cleaning from 3 to 5 PM". If it isn't done by the end time, it comes back the next day.
  - Priority (for "Until it's done"): Low is one reminder a day. Medium is a few a day. High is about every two hours. Reminders only go out between 8 AM and 8 PM. The form says exactly when the reminders will go out.
  - Who gets reminded: Everyone, or Only me.
  - For: who needs to do it. Tap as many people as you need. Whole family means anyone can.
  - Tap Add.
- On a reminder: tap Done when it's finished, and it goes off the list. Skip skips that time: it stays on the day's list, crossed out. Tapped one by mistake? Tap Undo on the skipped one, or on the "Done" message that pops up. Today's done reminders are also on the Done tab, each with Undo.
- An event ticked off as done goes off the Reminders page and Home too (it stays on the Calendar).
- To change or delete a reminder, tap its words to open it.
- Finished to-dos and today's done reminders are on the Done tab.

Feed
- Tap Feed at the bottom (the page is called Family Feed). It has updates, announcements, visit summaries and photos, and everyone in the family sees them.
- To post: type in "Share an update with your family…". You can pick who it's about and add a photo. Then tap Post.
- You can reply to a post, and change or delete your own posts. Pinned posts stay at the top.
- An announcement is news for the whole family: it shows on everyone's Home and sends them a notification. To send one, tap Announce on Home, or the green + and then Announcement. Type what everyone needs to know. Under "Send it" pick Now or At a later time, and pick how long to "Keep it on Home for".

Family
- Tap Family at the bottom to see everyone's profiles. The buttons at the top are Invite, Add Family Member and Add Pet.
- Adding someone: Name and Relationship (both required), Date of Birth (Birthday for a pet) and Important info. If they'll use GenCare on their own phone, tap Add & Invite: when they join with the invite, the profile becomes theirs. Otherwise tap Add Member.
- Tap a person to open their profile. A profile can have the tabs Overview, Info, School and Reminders.
- The switch "The family helps take care of them" on a profile puts that person on the Care Log.
- Inviting: tap Invite (on the Family page, or Settings, then My Family). They can point their phone's camera at the square code, or type the code on the join page. Copy code and Copy link let you text it to them. A code works for 7 days; Make a new code makes another.
- Settings, then My Family, lists the people with accounts in the family. The family's owner can remove someone there, and anyone can tap Leave this family.

Care Log
- In the menu, tap Care Log (or the green +, then Log care). It shows who did what today, so nobody has to ask.
- It shows the people the family helps take care of. To add someone, open their profile on the Family page and turn on "The family helps take care of them." Babies, kids and pets show up on their own.
- Tap a button when it happens, and it shows with who did it. "Choose buttons" picks which buttons show. Only you see what you log with a locked button.
- Track a number: among the buttons, tap Track a number, name it (like weight or hours of sleep) and type the first reading. It then has its own button: tap it each time you check to add a reading. "See the chart and past readings" in it shows them all, with a chart.
- Something else (the last button) writes down anything that doesn't have a button.

Recordings (record appointments and meetings, and read the notes)
- In the menu, tap Recordings. It's one page in two parts, told apart by color: "To record" at the top in red, with a microphone, and "Already recorded" below it in green.
- To record: type what it is in the box (optional), then tap Record. It's for an appointment, a meeting or a class. When it's over, tap Stop. GenCare writes short, clear notes the whole family can read (to-dos first, then the details), and you can pick who in the family sees them.
- Ask everyone there before you record. In 12 states everyone has to agree before you record them; "Which states?" on that page shows the list.
- "Coming up · not recorded yet" lists upcoming appointments, each marked "Not recorded yet". Open one to add "Things to bring up": questions you don't want to forget, which stay on screen while you record.
- On Home, the red Record button next to the next appointment starts a recording for it.
- How many recording minutes a family gets each month depends on its plan; the page shows what's left.
- Recording works in the GenCare app on your phone, not on the website. The website shows what's already recorded.
- Already recorded: every recording the family shared, newest first, by month. Each one shows what it was, who it was about, the day and time, how long it was, who recorded it (when it was someone else), and the first line of its notes. Tap one to read its notes. To go back, tap All recordings at the top.
- The box "Search or ask the recordings" finds the recordings with those words in their notes or what was said. Tap Ask to ask it a question, like "What did the doctor say about her knee?", and GenCare answers from the notes.
- The names under the box (Everyone, then each person) show only the recordings about that person.
- Fixing the transcript: the person who recorded it can open it, tap Full transcript, then tap any word that was heard wrong. "+ Word before" and "Word after +" take in more words (for a name heard as two words). Type what was really said under "What was really said" and tap Save, or tap "Take this word out". The notes then change to match, just where those words were, a few seconds after the last fix ("Now" does it right away). Only the person who recorded it can fix it.
- Only the recordings shared with you are there. Whoever recorded something picks who sees it.
- The newest ones are also on Home ("See all recordings") and on a person's profile (Overview: "Recordings about" them).

Resources
- In the menu, tap Resources: free and low-cost help for families caring for each other. Tap a number to call.
- "Places near you": type a ZIP code and tap Search to find the local Area Agency on Aging, adult day and respite care, equipment loan closets, support groups, meals and rides. A family can search a few new ZIP codes a day.

Help
- In the menu, tap Help. "Show me how" walks you through things one tap at a time, right on the screen. "Take the quick tour again" replays the tour. "Ask a question or submit feedback" opens this chat. "Send a message" writes to the person who makes GenCare.

Settings
- In the menu, tap Settings.
- Big text mode is at the top: it makes the words and buttons much bigger on that phone. Text size and Appearance (Light, Dark or Match my phone) are further down.
- My Family: who's in it, invites, the plan, notifications, who sees the events you add, and the phone calendar.
- Notifications (Settings, then My Family, then Notifications): "Notifications on"; "When someone adds or changes a family event, reminder or message"; "Reminders before appointments, due reminders, and the 7 AM "today" summary"; and "Send me a test notification". Each person picks their own. If no notifications come at all, GenCare's notifications may be turned off in the phone's own settings.
- AI features: a switch for the features that use OpenAI (see below).
- Help: Ask for help, and Report a bug, both go to the person who makes GenCare.
- Account Email: you can ask to change it.
- Terms of Use, Privacy Policy, and Account Management (delete your data or account).
- "Sign out" is at the bottom of Settings, and Sign Out is at the bottom of the menu.

The plan
- Settings, then My Family, then Plan shows the family's plan. "See the plan" (or "Manage plan") opens it. This guide doesn't have prices; the plan page shows them.

AI features
- Some features use OpenAI, an AI company, to do their work: Recordings (recordings and questions about notes), Events from a photo, the calendar's sorting of who an event is for and who sees it, Help near you on Resources (the ZIP code), and this Help chat (the questions). GenCare asks before any of them send anything, and the AI features switch in Settings changes it.`;

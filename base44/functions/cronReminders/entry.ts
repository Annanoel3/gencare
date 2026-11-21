import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { familyUsers, pushFamily, sendPush, wantsPush, whenText } from '../../shared/push.ts';
import { canSee } from '../../shared/sharing.ts';
import { expandAppointments } from '../../shared/recurrence.ts';
import { sameEvent } from '../../shared/sameEvent.ts';
import { claimDayFor, claimOn } from '../../shared/claims.ts';
import { isCareEvent } from '../../shared/eventColors.ts';
import { fetchRevenueCat } from '../../shared/revenuecat.ts';

// Runs every 15 minutes (workflow "Reminders every 15 minutes"). Three jobs,
// each in the family's own time (the owner's timezone, else the first
// member's, else America/Chicago):
//
//   1. Appointment reminders, an hour before an event (`reminder_minutes`,
//      default 60) and 10 minutes before (Anna, Nov 21 2026: "I think it
//      should be an hour before and 10 minutes until"), pushed to every family
//      member who wants reminders — or only the person who added it when the
//      event is private. This job runs every 15 minutes, so each push is
//      handed to OneSignal in the run before its time, set to arrive on the
//      minute (sendPush sendAt). Each goes once per start time
//      (reminder_sent_for / soon_sent_for = "YYYY-MM-DD HH:MM"), so an event
//      moved to another time is reminded again at the new one.
//  1b. A push offering to record a doctor-type visit, 10 minutes before it
//      starts, to everyone who'd get its reminders (see below). It takes the
//      place of their 10-minute reminder.
//  1c. A heads-up the day before a store free trial turns into a charge, to
//      the person who started it (see below).
//   2. Task due-time pushes: a task with a due date AND time, at that time.
//   3. The morning digest at 7:00 local: today's events and the tasks due
//      today or overdue, one push per person, once a day.
//   4. Reminders (stored in the Medication / MedicationLog tables): a push at
//      each set time (to the whole family, or only its owner for a "Just me"
//      one; an "until it's done" reminder every day until someone marks it done) (and a log row marked 'due' so the Done button has
//      something to flip), a "not done yet?" push and 'missed' status 90
//      minutes later if nobody marked it, and a "runs out" push once a day
//      from refill_reminder_days before the runs-out date (refill_date).
//   7. Milk stash: once a day at 8 AM, the stored milk whose use-by is
//      today, to whoever has been adding to that baby's stash.
//   6. Announcements set for later (Anna, Nov 10 2026): at their time, the
//      same push an announcement gets when it's posted, to everyone but the
//      person who wrote it. The app only offers quarter-hour times, so they
//      land on time with this 15-minute run.
//   5. Wellness: a daily 'how are you holding up?' push for anyone who
//      set an hour, skipped once they've checked in that day. (Off while the
//      Wellness page is hidden.)
//
// Anything someone said "I'll take it" to (claims, shared/claims.ts) reminds
// only them, for that day or for the whole thing.
//
// Replaces checkDueTasks (Jul 2026), which pushed every task in the whole
// app to every user at 13:00 UTC.

const WINDOW_MS = 15 * 60_000;
const SOON_MINUTES = 10;
// "in 1 hour", "in 10 min"
const leadText = (min: number) => (min >= 60 ? `in ${Math.round(min / 60)} hour${min >= 90 ? 's' : ''}` : `in ${Math.max(1, Math.round(min))} min`);
const DIGEST_HOUR = 7;

function partsIn(tz: string, when: Date) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(when)) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

function safeTz(tz: string | undefined) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz || '' }); return tz as string; } catch (_) { return 'America/Chicago'; }
}

// Epoch ms of a local date+time in tz (good to the minute; DST handled by Intl).
function localToMs(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  if (!y || !m || !d) return 0;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  // Offset of tz at that moment.
  const asTz = new Date(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(guess)).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z')).getTime();
  const offset = asTz - guess;
  return guess - offset;
}

function fmtClock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const now = Date.now();
  const out: Record<string, number> = { families: 0, appointment_reminders: 0, task_pushes: 0, digests: 0, reminder_pushes: 0, missed_pushes: 0, runs_out_pushes: 0, announcements: 0 };
const MISSED_AFTER_MS = 90 * 60_000;
  try {
    // Record keeping is kept 90 days (AppActivity), cleared once a day.
    const nowUtc = new Date(now);
    if (nowUtc.getUTCHours() === 9 && nowUtc.getUTCMinutes() < 15) {
      try {
        const cutoff = new Date(now - 90 * 86_400_000).toISOString();
        const old = (await db.AppActivity.filter({ at: { $lt: cutoff } }, 'at', 500)) || [];
        for (const r of old) await db.AppActivity.delete(r.id);
        out.activity_cleared = old.length;
      } catch (e) { console.warn('[cronReminders] activity cleanup:', (e as Error).message); }
    }
    const families = (await db.Family.list()) || [];
    for (const fam of families) {
      out.families++;
      const users = await familyUsers(db, fam.id);
      if (!users.length) continue;
      const owner = users.find((u: any) => u.id === fam.owner_user_id) || users[0];
      const tz = safeTz(owner.timezone);
      const local = partsIn(tz, new Date(now));
      const today = local.day;
      const tomorrow = addDays(today, 1);

      // 1c. The store's free trial is about to turn into a charge (Anna, Nov 18
      //     2026: "So they can cancel if they want and not feel cheated
      //     because they forgot"). One push to the person who started it, 12 to
      //     36 hours before, between 9 AM and 9 PM their time; a tap opens the
      //     app's "Your free trial ends..." popup with Keep and Cancel
      //     (components/shared/TrialEndingNotice). RevenueCat is asked first, so
      //     someone who already cancelled hears nothing. Once per trial
      //     (Family.trial_warned_for = the end it was sent for).
      try {
        const endsAt = fam.subscription_expires_at ? Date.parse(fam.subscription_expires_at) : 0;
        const left = endsAt - now;
        const payer = users.find((u: any) => u.id === fam.subscription_user_id);
        const payerTz = safeTz(payer?.timezone || tz);
        const hour = partsIn(payerTz, new Date(now)).hour;
        if (fam.subscription_active && fam.subscription_trial && fam.subscription_will_renew && payer
            && left > 0 && left <= 36 * 3600_000 && hour >= 9 && hour < 21
            && fam.trial_warned_for !== fam.subscription_expires_at) {
          const info: any = await fetchRevenueCat(payer.id);
          // Not set up: go by what's saved. Otherwise only while it's really a trial that renews.
          const still = !info.configured || (info.active && info.trial && info.will_renew);
          await db.Family.update(fam.id, { trial_warned_for: fam.subscription_expires_at });
          if (still && wantsPush(payer, 'reminders')) {
            const end = new Date(info.configured && info.expires_at ? info.expires_at : fam.subscription_expires_at);
            const endParts = partsIn(payerTz, end);
            const nowDay = partsIn(payerTz, new Date(now)).day;
            const when = endParts.day === nowDay ? 'today' : endParts.day === addDays(nowDay, 1) ? 'tomorrow'
              : new Intl.DateTimeFormat('en-US', { timeZone: payerTz, weekday: 'long' }).format(end);
            const clock = fmtClock(`${endParts.hour}:${String(endParts.minute).padStart(2, '0')}`);
            const product = String((info.configured && info.product_id) || fam.subscription_product_id || '');
            const price = /year/i.test(product) ? '$39.99 a year' : '$5.99 a month';
            const store = /app_store|mac_app_store/i.test(String(fam.subscription_store || info.store || '')) ? 'The App Store' : 'Google Play';
            await sendPush({
              email: payer.email,
              title: `Your GenCare free trial ends ${when}`,
              message: `${store} starts charging ${price} ${when} at ${clock}. Tap to keep it or cancel.`,
              data: { type: 'trial_ending', screen: '/?trial_ending=1' },
              priority: 'high',
            });
            out.trial_warnings = (out.trial_warnings || 0) + 1;
          }
        }
      } catch (e) { console.warn('[cronReminders] trial ending:', (e as Error).message); }

      // 6. Announcements set for later whose time has come (up to a minute
      //    early, since the run can start a little before the quarter hour).
      //    More than 12 hours late (the run was down) they show on Home but
      //    don't buzz anyone's phone.
      try {
        const due = (await db.FamilyMessage.filter({ family_id: fam.id, category: 'Announcement', announce_at: { $lte: new Date(now + 60_000).toISOString() } }, '-announce_at', 50)) || [];
        for (const m of due) {
          if (m.parent_id || m.announce_sent) continue;
          const at = new Date(String(m.announce_at)).getTime();
          if (!at) continue;
          await db.FamilyMessage.update(m.id, { announce_sent: true });
          if (now - at > 12 * 3_600_000) continue;
          const author = String(m.author_name || '').trim().split(' ')[0] || 'someone';
          await pushFamily(db, fam.id, {
            title: `Announcement from ${author}`,
            message: String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            data: { type: 'announcement', messageId: m.id, screen: '/' },
            exceptUserId: m.author_user_id,
            need: 'announcements',
            priority: 'high',
          });
          out.announcements++;
        }
      } catch (e) { console.warn('[cronReminders] announcements:', (e as Error).message); }

      // 1. Appointment reminders (today's and tomorrow's rows; a reminder can
      //    land the evening before an early event).
      //    A repeating event lands on today through its RRULE, not its row date,
      //    so the series rows come along and are expanded per day; a reminder
      //    for an occurrence is remembered by its day (reminder_sent_for).
      const plain = [
        ...((await db.Appointment.filter({ family_id: fam.id, date: today })) || []),
        ...((await db.Appointment.filter({ family_id: fam.id, date: tomorrow })) || []),
      ].filter((a: any) => !a.recurrence);
      let series: any[] = [];
      try { series = (await db.Appointment.filter({ family_id: fam.id, recurrence: { $regex: '^RRULE' } })) || []; }
      catch (_) { series = ((await db.Appointment.filter({ family_id: fam.id })) || []).filter((a: any) => a.recurrence); }
      const appts = expandAppointments([...plain, ...series], today, tomorrow);
      const pushedFor: { a: any; to: string[] }[] = [];
      for (const a of appts) {
        const isSeries = !!a.occurrence_of;
        const rowId = a.occurrence_of || a.id;
        const at = `${a.date} ${a.time}`;
        // Sent for this start time (older rows: a series kept just the day, a one-off just reminder_sent).
        if (a.reminder_sent_for === at || (isSeries ? a.reminder_sent_for === a.date : a.reminder_sent && !a.reminder_sent_for)) continue;
        if (a.all_day || !a.time) continue;
        const minutes = typeof a.reminder_minutes === 'number' ? a.reminder_minutes : 60;
        if (minutes < 0) continue;
        const startMs = localToMs(a.date, a.time, a.timezone ? safeTz(a.timezone) : tz);
        if (!startMs) continue;
        const fireAt = startMs - minutes * 60_000;
        // Handed over in the run before its time (or now, for one added late, while it's still well ahead).
        if (now < fireAt - WINDOW_MS || startMs - now <= (SOON_MINUTES + 5) * 60_000) continue;
        const forWhom = a.family_member_name ? ` for ${a.family_member_name}` : '';
        const inText = leadText(now >= fireAt ? (startMs - now) / 60_000 : minutes);
        const sent = { reminder_sent: true, reminder_sent_for: at };
        // Already checked off on To-do (this copy or the same event from
        // someone else's calendar): no reminder.
        const dayKey = claimDayFor('event', a, a.date);
        const checkedOn = (b: any) => (Array.isArray(b?.checks) ? b.checks : []).some((c: any) => c && c.user_id && String(c.day || '') === dayKey);
        if (checkedOn(a) || (!dayKey && appts.some((b: any) => b !== a && b.date === a.date && sameEvent(a, b) && checkedOn(b)))) {
          await db.Appointment.update(rowId, isSeries ? { reminder_sent_for: at } : sent);
          continue;
        }
        // "I'll take it": the reminder goes to whoever took it (on this row or
        // on the same event from someone else's calendar).
        const day = claimDayFor('event', a, a.date);
        const claim = claimOn(a, day) || (day ? null : appts.filter((b: any) => b !== a && b.date === a.date && sameEvent(a, b)).map((b: any) => claimOn(b, '')).find(Boolean)) || null;
        const taker = claim ? users.find((u: any) => u.id === claim.user_id && canSee(a, u.id)) : null;
        const targets = taker ? [taker] : users.filter((u: any) => canSee(a, u.id));
        // The same event on two calendars reminds each person once.
        const twins = pushedFor.filter((p) => p.a.date === a.date && sameEvent(a, p.a));
        const sentTo = new Set(twins.flatMap((p) => p.to));
        pushedFor.push({ a, to: targets.map((u: any) => u.id) });
        for (const u of targets) {
          if (!wantsPush(u, 'reminders') || sentTo.has(u.id)) continue;
          await sendPush({
            email: u.email,
            title: `${a.title}${forWhom} ${inText}`,
            message: `${whenText(a.date, a.time, tz)}${a.location ? ` · ${a.location}` : ''}`,
            data: { type: 'appointment_reminder', appointmentId: a.id, screen: '/calendar', date: a.date },
            priority: 'high',
            sendAt: fireAt,
          });
          out.appointment_reminders++;
        }
        await db.Appointment.update(rowId, isSeries ? { reminder_sent_for: at } : sent);
      }

      // 1b. Offer to record a doctor-type visit (Anna, Nov 18 2026: "a
      //     notification about 10 minutes before a doctor's visit or something
      //     like that offering to record"). This job runs every 15 minutes, so
      //     the push lands 5 to 19 minutes before: about 15 for a visit on the
      //     quarter hour. A tap opens the visit's Record Notes page, Start
      //     recording ready for when the visit begins (starting on the tap would
      //     record the waiting room). It goes to everyone who'd get the
      //     visit's reminders (Anna, Nov 21 2026: "the person listed as going
      //     to the appointment might be the one being cared for and may not be
      //     in charge of the recording. The person who drove them there might
      //     be instead"): the one who said "I'll take it", else everyone who
      //     can see it. Whoever opens it after someone else started recording
      //     is told so on the Record Notes page (Appointment.recording_now).
      //     Not for a visit already recorded or checked off; once per visit
      //     (record_offer_for: the day it was offered).
      const people = ((await db.FamilyMember.filter({ family_id: fam.id })) || []) as any[];
      const offered: { a: any; to: string }[] = [];
      try {
        for (const a of appts) {
          // Reminders turned off for the event (None): no push about it at all.
          if (a.cover_of || a.all_day || !a.time || a.record_offer_for === a.date || a.reminder_minutes < 0) continue;
          if (!['Appointment', 'Doctor', 'Therapy'].includes(String(a.category || 'Appointment')) || !isCareEvent(a, people)) continue;
          const startMs = localToMs(a.date, a.time, a.timezone ? safeTz(a.timezone) : tz);
          const ahead = startMs - now;
          if (!startMs || ahead <= 60_000 || ahead > (SOON_MINUTES * 60_000 + WINDOW_MS)) continue;
          const rowId = a.occurrence_of || a.id;
          const dayKey = claimDayFor('event', a, a.date);
          // Checked off on this row, or on the same visit from someone else's calendar.
          const checkedOn = (b: any) => (Array.isArray(b?.checks) ? b.checks : []).some((c: any) => c && c.user_id && String(c.day || '') === dayKey);
          const checked = checkedOn(a) || (!dayKey && appts.some((b: any) => b !== a && b.date === a.date && sameEvent(a, b) && checkedOn(b)));
          let recorded = !a.occurrence_of && !!a.notes_record_id;
          if (!recorded && !checked) {
            const recs = ((await db.NoteRecording.filter({ appointment_id: rowId }, '-started_at', 20)) || []) as any[];
            recorded = recs.some((r: any) => !r.parent_record_id && (!a.occurrence_of || (r.started_at && partsIn(tz, new Date(r.started_at)).day === a.date)));
          }
          await db.Appointment.update(rowId, { record_offer_for: a.date });
          if (checked || recorded) continue;
          const claim = claimOn(a, dayKey) || (dayKey ? null : appts.filter((b: any) => b !== a && b.date === a.date && sameEvent(a, b)).map((b: any) => claimOn(b, '')).find(Boolean)) || null;
          const person = people.find((p: any) => p.id === a.family_member_id);
          const taker = claim ? users.find((u: any) => u.id === claim.user_id && canSee(a, u.id)) : null;
          const targets = taker ? [taker] : users.filter((u: any) => canSee(a, u.id));
          const q = new URLSearchParams({ appointment: rowId });
          if (a.occurrence_of) q.set('on', a.date);
          const first = String(a.family_member_name || '').split(' ')[0];
          for (const u of targets) {
            if (!wantsPush(u, 'reminders')) continue;
            // The same visit on two calendars is offered once.
            if (offered.some((o) => o.to === u.id && o.a.date === a.date && sameEvent(a, o.a))) continue;
            offered.push({ a, to: u.id });
            // "for Pam" unless it's Pam's own phone, or the title already says ("Kiri vet").
            const forWhom = first && person?.linked_user_id !== u.id && !String(a.title || '').toLowerCase().includes(first.toLowerCase()) ? ` for ${first}` : '';
            await sendPush({
              email: u.email,
              title: `${a.title}${forWhom} at ${fmtClock(a.time)}`,
              message: 'Tap to record the visit. GenCare will write up notes for the family.',
              data: { type: 'record_offer', appointmentId: rowId, date: a.date, screen: `/notes?${q}` },
              priority: 'high',
              sendAt: startMs - SOON_MINUTES * 60_000,
            });
            out.record_offers = (out.record_offers || 0) + 1;
          }
        }
      } catch (e) { console.warn('[cronReminders] record offers:', (e as Error).message); }

      // 1c. Ten minutes before: the same people as the hour-before reminder,
      //     except whoever just got the offer to record it (that push is their
      //     10-minute one).
      try {
        const soonFor: { a: any; to: string[] }[] = [];
        for (const a of appts) {
          if (a.all_day || !a.time || a.reminder_minutes < 0) continue;
          const rowId = a.occurrence_of || a.id;
          const at = `${a.date} ${a.time}`;
          if (a.soon_sent_for === at) continue;
          const startMs = localToMs(a.date, a.time, a.timezone ? safeTz(a.timezone) : tz);
          const ahead = startMs - now;
          if (!startMs || ahead <= 60_000 || ahead > SOON_MINUTES * 60_000 + WINDOW_MS) continue;
          await db.Appointment.update(rowId, { soon_sent_for: at });
          const dayKey = claimDayFor('event', a, a.date);
          const checkedOn = (b: any) => (Array.isArray(b?.checks) ? b.checks : []).some((c: any) => c && c.user_id && String(c.day || '') === dayKey);
          if (checkedOn(a) || (!dayKey && appts.some((b: any) => b !== a && b.date === a.date && sameEvent(a, b) && checkedOn(b)))) continue;
          const claim = claimOn(a, dayKey) || (dayKey ? null : appts.filter((b: any) => b !== a && b.date === a.date && sameEvent(a, b)).map((b: any) => claimOn(b, '')).find(Boolean)) || null;
          const taker = claim ? users.find((u: any) => u.id === claim.user_id && canSee(a, u.id)) : null;
          const targets = taker ? [taker] : users.filter((u: any) => canSee(a, u.id));
          const twins = soonFor.filter((p) => p.a.date === a.date && sameEvent(a, p.a));
          const sentTo = new Set(twins.flatMap((p) => p.to));
          soonFor.push({ a, to: targets.map((u: any) => u.id) });
          const forWhom = a.family_member_name ? ` for ${a.family_member_name}` : '';
          const sendAt = startMs - SOON_MINUTES * 60_000;
          for (const u of targets) {
            if (!wantsPush(u, 'reminders') || sentTo.has(u.id)) continue;
            if (offered.some((o) => o.to === u.id && o.a.date === a.date && (o.a === a || sameEvent(a, o.a)))) continue;
            await sendPush({
              email: u.email,
              title: `${a.title}${forWhom} ${leadText(now >= sendAt ? ahead / 60_000 : SOON_MINUTES)}`,
              message: `${whenText(a.date, a.time, tz)}${a.location ? ` · ${a.location}` : ''}`,
              data: { type: 'appointment_reminder', appointmentId: a.id, screen: '/calendar', date: a.date },
              priority: 'high',
              sendAt,
            });
            out.soon_reminders = (out.soon_reminders || 0) + 1;
          }
        }
      } catch (e) { console.warn('[cronReminders] 10-minute reminders:', (e as Error).message); }

      // 2. Tasks at their due time.
      const dueTasks = (await db.CareTask.filter({ family_id: fam.id, due_date: today })) || [];
      for (const t of dueTasks) {
        if (!t.due_time || t.reminder_sent_at || t.parent_task_id) continue;
        if (t.status === 'completed' || t.status === 'cancelled') continue;
        const dueMs = localToMs(t.due_date, t.due_time, tz);
        if (!dueMs || now < dueMs || now >= dueMs + WINDOW_MS) continue;
        const targets = t.assigned_user_id ? users.filter((u: any) => u.id === t.assigned_user_id) : users;
        for (const u of targets) {
          if (!wantsPush(u, 'reminders')) continue;
          await sendPush({
            email: u.email,
            // The task first, how it stands under it (same as reminders).
            title: String(t.title || 'Task').slice(0, 90),
            message: ['Due now', t.family_member_name ? `For ${String(t.family_member_name).split(' ')[0]}` : ''].filter(Boolean).join(' · '),
            data: { type: 'task_due', taskId: t.id, screen: `/tasks?highlight=${t.id}` },
            priority: 'high',
          });
          out.task_pushes++;
        }
        await db.CareTask.update(t.id, { reminder_sent_at: new Date(now).toISOString() });
      }

      // 4. Reminders.
      const meds = ((await db.Medication.filter({ family_id: fam.id })) || []).filter((m: any) => m.is_active !== false);
      if (meds.length) {
        // The family's people, to find who a reminder is for by their account.
        const famPeople = ((await db.FamilyMember.filter({ family_id: fam.id })) || []) as any[];
        const dow = new Date(localToMs(today, '12:00', tz)).getUTCDay();
        const logsToday = (await db.MedicationLog.filter({ family_id: fam.id, day: today })) || [];
        const logFor = (m: any, t: string) => logsToday.find((l: any) => l.medication_id === m.id && l.time === t);
        for (const m of meds) {
          const times: string[] = Array.isArray(m.times) ? m.times.filter((t: string) => /^\d{2}:\d{2}$/.test(t)) : [];
          const days: number[] = Array.isArray(m.days_of_week) ? m.days_of_week : [];
          // The task itself is the push's title, so a collapsed notification
          // still says what it is (Anna, Nov 6 2026: on Android it only showed
          // "Not done yet?" and "The 1:00 PM reminder isn't marked done yet").
          // The line under it says where it stands, then who it's for.
          const what = String(m.medication_name || 'Reminder').slice(0, 90);
          // "For Peach and Kaiju" for a reminder that's for more than one.
          const about = [m.family_member_name ? `For ${/, | and /.test(String(m.family_member_name)) ? m.family_member_name : String(m.family_member_name).split(' ')[0]}` : '', m.dosage || ''].filter(Boolean).join(' · ');
          const line = (...parts: string[]) => parts.filter(Boolean).join(' · ').slice(0, 180);
          // Steps, like a checklist (Anna, Nov 14 2026): how far along it is
          // ("2 of 5 steps done"), or how many there are before any are ticked.
          // Ticks are "slot|step": slot "all" for until-it's-done, else "day@time".
          const stepList: string[] = [...new Set((Array.isArray(m.steps) ? m.steps : []).map((x: any) => String(x || '').trim()).filter(Boolean))] as string[];
          const stepsLine = (t: string) => {
            if (!stepList.length) return '';
            const key = m.frequency === 'Once' ? 'all' : `${today}@${t}`;
            const ticked = (Array.isArray(m.steps_done) ? m.steps_done : []).map(String).filter((x: string) => x.startsWith(`${key}|`)).map((x: string) => x.slice(key.length + 1));
            const n = stepList.filter((x) => ticked.includes(x)).length;
            return n ? `${n} of ${stepList.length} steps done` : `${stepList.length} step${stepList.length === 1 ? '' : 's'}`;
          };
          // Lands on the reminder in To-do (glowing), not its edit popup (Anna, Oct 31 2026).
          const screen = `/tasks?highlight=${m.id}`;
          // "Just me" reminders go only to the person who keeps them.
          const isPrivate = m.visibility === 'private';
          const ownerId = m.owner_user_id || m.created_by_id || '';
          // "I'll take it" (for today, or for the whole thing): just them.
          // No "I'll take it" on reminders any more (Anna, Nov 17 2026: it only makes
          // sense for events), so an old claim no longer narrows who's reminded.
          const taker: any = null;
          // Who it's for is who does it (Anna, Nov 17 2026: "this reminder is for
          // Anna" means Anna needs to do it): just them, when they have GenCare
          // themselves. For someone without an account yet (a profile made by
          // hand), or an older reminder for a pet, everyone, so it never goes
          // to nobody. A general reminder nobody took: everyone.
          const forList: string[] = Array.isArray(m.family_member_ids) && m.family_member_ids.length ? m.family_member_ids : m.family_member_id ? [m.family_member_id] : [];
          const doerIds = [...new Set(forList.map((id) => famPeople.find((p: any) => p.id === id)?.linked_user_id).filter(Boolean))];
          const doers = doerIds.map((uid) => users.find((u: any) => u.id === uid)).filter(Boolean);
          const audience = isPrivate ? users.filter((u: any) => u.id === ownerId) : taker ? [taker] : doers.length ? doers : users;
          // Going only to the one person it's for: no "For Anna" under it.
          const toTheOne = !isPrivate && !taker && doers.length === 1;
          const aboutLine = toTheOne ? String(m.dosage || '') : about;
          // "Until it's done" (frequency Once): every day from its start day, at
          // the times its priority set (low 1 a day, medium 3, high every 2
          // hours); the app switches it off (is_active false) when someone marks
          // it done, and a skip quiets it for the rest of the day.
          // "One time": one push, at its time on its day, and that's all.
          const until = m.frequency === 'Once';
          const oneTime = m.frequency === 'One time';
          // A to-do with an end time (Anna, Nov 19 2026: "pick up dry cleaning
          // from 3-5 p.m."): the first push says the range, later ones how long is left.
          const startAt = until ? String(m.anchor_time || '') : String(times[0] || '');
          const endAt = (until || oneTime) && /^\d{2}:\d{2}$/.test(String(m.end_time || '')) && startAt && m.end_time > startAt ? String(m.end_time) : '';
          const onToday = until ? !!m.once_date && m.once_date <= today
            : oneTime ? m.once_date === today
            : (!days.length || days.includes(dow)) && !(m.end_date && today > m.end_date); // past its last day
          const quietToday = until && logsToday.some((l: any) => l.medication_id === m.id && (l.status === 'taken' || l.status === 'skipped'));
          if (m.remind !== false && onToday && !quietToday) {
            for (const t of (oneTime ? times.slice(0, 1) : times)) {
              // Not done after its first push: later ones say so.
              const stillWaiting = until && !!m.once_date && (m.once_date < today || (!!m.anchor_time && t > m.anchor_time));
              const slotMs = localToMs(today, t, tz);
              if (!slotMs) continue;
              let log: any = logFor(m, t);
              // Due now: one push, one 'due' row.
              if (now >= slotMs && now < slotMs + WINDOW_MS && !log) {
                log = await db.MedicationLog.create({ family_id: fam.id, medication_id: m.id, medication_name: m.medication_name, family_member_id: m.family_member_id, family_member_name: m.family_member_name, day: today, time: t, status: 'due', due_pushed_at: new Date(now).toISOString(), visibility: isPrivate ? 'private' : 'family', owner_user_id: ownerId });
                logsToday.push(log);
                for (const u of audience) {
                  if (!wantsPush(u, 'reminders')) continue;
                  await sendPush({ email: u.email, title: what, message: line(stillWaiting ? `Still to do${endAt ? ` · until ${fmtClock(endAt)}` : ''}` : endAt ? `${fmtClock(startAt)} – ${fmtClock(endAt)}` : `Due ${fmtClock(t)}`, stepsLine(t), aboutLine, m.notes ? String(m.notes).split('\n')[0].slice(0, 100) : ''), data: { type: 'reminder_due', reminderId: m.id, logId: log.id, screen }, priority: 'high' });
                  out.reminder_pushes++;
                }
                continue;
              }
              // Still 'due' well past its time: missed. Not for "until it's done"
              // (its next push is the nudge) or "one time" (one push, that's all).
              if (!until && !oneTime && log && log.status === 'due' && !log.missed_pushed_at && now >= slotMs + MISSED_AFTER_MS) {
                await db.MedicationLog.update(log.id, { status: 'missed', missed_pushed_at: new Date(now).toISOString() });
                log.status = 'missed';
                for (const u of audience) {
                  if (!wantsPush(u, 'reminders')) continue;
                  await sendPush({ email: u.email, title: what, message: line(`Not done yet (due ${fmtClock(t)})`, stepsLine(t), aboutLine), data: { type: 'reminder_missed', reminderId: m.id, logId: log.id, screen }, priority: 'high' });
                  out.missed_pushes++;
                }
              }
            }
          }
          // Runs out: once a day, from N days before, in the morning.
          if (m.refill_date && !(m.end_date && today > m.end_date) && local.hour === DIGEST_HOUR + 1 && local.minute < 15 && m.refill_reminded_on !== today) {
            const leadDays = typeof m.refill_reminder_days === 'number' ? m.refill_reminder_days : 3;
            const daysLeft = Math.round((Date.UTC(+m.refill_date.slice(0, 4), +m.refill_date.slice(5, 7) - 1, +m.refill_date.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000);
            if (daysLeft <= leadDays && daysLeft >= -30) {
              const when = daysLeft < 0 ? `ran out ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago` : daysLeft === 0 ? 'runs out today' : daysLeft === 1 ? 'runs out tomorrow' : `runs out in ${daysLeft} days`;
              for (const u of audience) {
                if (!wantsPush(u, 'reminders')) continue;
                await sendPush({ email: u.email, title: `${m.medication_name} ${when}`, message: m.family_member_name && !toTheOne ? `For ${m.family_member_name}. Time to restock.` : 'Time to restock.', data: { type: 'reminder_restock', reminderId: m.id, screen } });
                out.runs_out_pushes++;
              }
              await db.Medication.update(m.id, { refill_reminded_on: today });
            }
          }
        }
      }

      // 7. Milk stash (Anna, Nov 10 2026): once a day at 8 AM, the milk that
      //    has to be used today (its use-by falls today: 4 days from pumping
      //    in the fridge, 24 hours once thawed, 12 months in the freezer),
      //    to whoever has been adding milk to that baby's stash.
      if (local.hour === DIGEST_HOUR + 1 && local.minute < 15) {
        try {
          const bags = ((await db.MilkStash.filter({ family_id: fam.id, status: 'in' })) || []) as any[];
          const DAY = 86_400_000;
          const useByOf = (b: any) => {
            const pumped = new Date(String(b.pumped_at || '')).getTime();
            if (b.place === 'thawed') return (new Date(String(b.thawed_at || b.pumped_at || '')).getTime() || 0) + DAY;
            if (b.place === 'freezer') { const d = new Date(pumped); d.setUTCMonth(d.getUTCMonth() + 12); return d.getTime(); }
            return pumped + 4 * DAY;
          };
          const today_ = bags.filter((b) => b.reminded_on !== today && useByOf(b) > now && partsIn(tz, new Date(useByOf(b))).day === today);
          const byBaby = new Map<string, any[]>();
          for (const b of today_) { const k = String(b.family_member_id || ''); if (!byBaby.has(k)) byBaby.set(k, []); byBaby.get(k)!.push(b); }
          for (const [babyId, list] of byBaby) {
            const oz = Math.round(list.reduce((a, b) => a + (Number(b.amount) || 0), 0) * 10) / 10;
            const soonest = Math.min(...list.map(useByOf));
            const at = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(soonest));
            const name = String(list[0].family_member_name || '').trim().split(' ')[0];
            const adders = new Set(bags.filter((b) => b.family_member_id === babyId).map((b) => b.added_by_user_id).filter(Boolean));
            for (const u of users) {
              if (!adders.has(u.id) || !wantsPush(u, 'reminders')) continue;
              await sendPush({
                email: u.email,
                title: `Milk to use today${name ? ` for ${name}` : ''}`,
                message: `${oz} oz (${list.length} bag${list.length === 1 ? '' : 's'}) · the first one by ${at}`,
                data: { type: 'milk_stash', screen: `/care-log?for=${babyId}` },
              });
              out.milk_pushes = (out.milk_pushes || 0) + 1;
            }
            for (const b of list) await db.MilkStash.update(b.id, { reminded_on: today });
          }
        } catch (e) { console.warn('[cronReminders] milk stash:', (e as Error).message); }
      }

      // 5. Caregiver wellness: a once-a-day "how are you holding up?" at the
      // hour each person picked, skipped if they already checked in today.
      // Each person's own timezone, since this is about them, not the family.
      // Off while the Wellness page is hidden (Oct 30 2026): the push would
      // open a page nobody can reach. Turn WELLNESS_PUSH back on with it.
      const WELLNESS_PUSH = false;
      for (const u of WELLNESS_PUSH ? users : []) {
        // Off is -1 (an hour of 0-23 means on).
        const hour = Number.isInteger(u.wellness_reminder_hour) && u.wellness_reminder_hour >= 0 && u.wellness_reminder_hour <= 23 ? u.wellness_reminder_hour : null;
        if (hour === null || !wantsPush(u, 'reminders')) continue;
        const utz = safeTz(u.timezone || tz);
        const ul = partsIn(utz, new Date(now));
        if (ul.hour !== hour || ul.minute >= 15 || u.wellness_reminded_on === ul.day) continue;
        const done = (await db.WellnessCheckin.filter({ user_id: u.id, day: ul.day })) || [];
        await db.User.update(u.id, { wellness_reminded_on: ul.day });
        if (done.length) continue;
        const r = await sendPush({
          email: u.email,
          title: 'How are you holding up?',
          message: 'A 20-second check-in for you, not for anyone else.',
          data: { type: 'wellness', screen: '/wellness' },
        });
        console.log('[cronReminders] wellness push', u.email, JSON.stringify(r));
        out.wellness_pushes = (out.wellness_pushes || 0) + 1;
      }

      // 3. Morning digest.
      if (local.hour === DIGEST_HOUR && local.minute < 15) {
        const todays = appts.filter((a: any) => a.date === today);
        const allTasks = (await db.CareTask.filter({ family_id: fam.id })) || [];
        // Steps live inside their task and never count on their own.
        const open = allTasks.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled' && !t.parent_task_id);
        const dueToday = open.filter((t: any) => t.due_date === today);
        const overdue = open.filter((t: any) => t.due_date && t.due_date < today);
        if (!todays.length && !dueToday.length && !overdue.length) continue; // an empty day sends nothing
        for (const u of users) {
          if (!wantsPush(u, 'reminders')) continue;
          if (u.digest_sent_on === today) continue;
          const mine = todays.filter((a: any) => canSee(a, u.id));
          const parts: string[] = [];
          if (mine.length) parts.push(`${mine.length} event${mine.length > 1 ? 's' : ''}: ${mine.slice(0, 3).map((a: any) => `${a.title}${a.time ? ` ${whenText(a.date, a.time, tz).split(' at ')[1]}` : ''}`).join(', ')}${mine.length > 3 ? ` +${mine.length - 3}` : ''}`);
          if (dueToday.length) parts.push(`${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`);
          if (overdue.length) parts.push(`${overdue.length} overdue`);
          if (!parts.length) continue;
          await sendPush({
            email: u.email,
            title: `Today for ${fam.name || 'your family'}`,
            message: parts.join(' · '),
            data: { type: 'digest', screen: '/' },
          });
          await db.User.update(u.id, { digest_sent_on: today });
          out.digests++;
        }
      }
    }
    console.log('[cronReminders] ran', JSON.stringify(out));
    return Response.json({ ok: true, ...out });
  } catch (e) {
    console.error('[cronReminders]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message, ...out }, { status: 500 });
  }
});

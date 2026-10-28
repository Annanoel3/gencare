import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// The phone's calendars and the family calendar, both ways. Called by the web
// app (on open, after edits, from the Phone calendar settings) and by the
// Android app's CalendarSyncWorker with the app closed.
//
//   { mode: "settings", ...fields }   -> saves the person's choices (which phone
//        calendars to import, which of those to share with the family, whether
//        and where to export, and the export filter) on their User row.
//   { mode: "import", calendarIds, rows } -> rows as CalendarBridge.readEvents
//        gives them. Each becomes an Appointment (source "phone") keyed by
//        device_key so it's never imported twice; edits on the phone update it;
//        an event gone from the phone is removed here. Imported events are
//        PRIVATE unless the person shared that calendar (import_share_calendar_ids),
//        so importing a personal Google calendar never floods the family.
//   { mode: "export_pull" }  -> what to write to THIS person's phone: the family
//        events that pass their own filter (family members, categories), with
//        the calendar to write into, plus the phone events to delete (no longer
//        wanted, or export switched off). Events this person imported from
//        their own phone are never sent back to it.
//   { mode: "export_report", results, deleted } -> what the phone wrote, so the
//        same phone row is updated next time instead of duplicated.
//   { mode: "status" } -> counts for the settings screen.

const DAYS_AHEAD = 365;
const DAYS_BACK = 7;
const CATEGORIES = ['Doctor', 'Therapy', 'School', 'Sports', 'Social', 'Other'];

function safeTz(tz: string | undefined) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz || '' }); return tz as string; } catch (_) { return 'America/Chicago'; }
}

// Epoch ms -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in tz.
function localParts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
}

// Local date+time in tz -> epoch ms (to the minute, DST via Intl).
function localToMs(date: string, time: string, tz: string): number {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  if (!y || !m || !d) return 0;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(guess))) p[x.type] = x.value;
  const asTz = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return guess - (asTz - guess);
}

function todayIn(tz: string) { return localParts(Date.now(), tz).date; }
// 'YYYY-MM-DD' -> UTC midnight ms (how Android stores all-day events).
function utcDay(date: string): number {
  const [y, m, d] = String(date).split('-').map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : 0;
}
function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function hashOf(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isHolidayFeed(name: string) { return /^holidays? in /i.test(String(name || '').trim()); }

// One phone row -> appointment fields.
function rowToAppointment(row: any, calendarId: string, tz: string, shared: boolean, user: any) {
  const begin = Number(row.nextBegin) || Number(row.dtstart) || 0;
  if (!begin) return null;
  let end = Number(row.nextEnd) || Number(row.dtend) || 0;
  const allDay = !!row.allDay;
  let date: string, time: string, endDate = '', endTime = '';
  if (allDay) {
    // All-day rows sit at UTC midnight of the day.
    date = new Date(begin).toISOString().slice(0, 10);
    time = '';
    if (end) endDate = new Date(end - 1).toISOString().slice(0, 10);
  } else {
    const s = localParts(begin, tz);
    date = s.date; time = s.time;
    if (end && end > begin) {
      const e = localParts(end, tz);
      endTime = e.time;
      if (e.date !== date) endDate = e.date;
    }
  }
  const title = String(row.title || '').trim() || 'Untitled event';
  return {
    title,
    date, time, end_time: endTime, end_date: endDate, all_day: allDay,
    timezone: row.timezone || tz,
    location: String(row.location || ''),
    notes: String(row.description || '').slice(0, 4000),
    category: guessCategory(title),
    source: 'phone',
    visibility: shared ? 'family' : 'private',
    recurrence: row.rrule ? `RRULE:${row.rrule}` : '',
    created_by_user_id: user.id,
    created_by_name: user.display_name || user.full_name || '',
    reminder_minutes: -1, // the phone's own calendar already reminds about its events
    last_changed_at: new Date().toISOString(),
  };
}

function guessCategory(title: string) {
  const t = title.toLowerCase();
  if (/\b(dr\.?|doctor|dentist|ortho|pediatric|clinic|md|appt|appointment|checkup|check-up|vaccine|shot|hospital|lab|blood)\b/.test(t)) return 'Doctor';
  if (/\b(therap|pt |ot |speech|counsel|psych)/.test(t)) return 'Therapy';
  if (/\b(school|class|teacher|pta|parent|conference|tutor|homework|exam|test)\b/.test(t)) return 'School';
  if (/\b(practice|game|soccer|football|baseball|basketball|swim|dance|gym|match|tournament|karate|ballet)\b/.test(t)) return 'Sports';
  if (/\b(birthday|party|dinner|lunch|brunch|visit|wedding|playdate|sleepover|bbq)\b/.test(t)) return 'Social';
  return 'Other';
}

function fieldsMatch(a: any, b: any) {
  return ['title', 'date', 'time', 'end_time', 'end_date', 'all_day', 'location', 'notes', 'recurrence', 'visibility'].every((k) => (a?.[k] ?? '') === (b?.[k] ?? ''));
}

function passesFilter(a: any, user: any) {
  const members: string[] = Array.isArray(user.export_member_ids) ? user.export_member_ids : [];
  const cats: string[] = Array.isArray(user.export_categories) ? user.export_categories : [];
  if (members.length && !members.includes(a.family_member_id || '')) {
    // "Only these people": an event with no person attached still goes if it's mine.
    if (!(a.created_by_user_id === user.id && !a.family_member_id)) return false;
  }
  if (cats.length && !cats.includes(a.category || 'Other')) return false;
  return true;
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  let me: any = null;
  try { me = await base44.auth.me(); } catch (_) { me = null; }
  if (!me?.id) return Response.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  const db = base44.asServiceRole.entities;
  const user = (await db.User.filter({ id: me.id }))?.[0] || me;
  const familyId = user.family_id;
  if (!familyId) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });
  const tz = safeTz(body.timezone || user.timezone);
  const mode = String(body.mode || 'status');

  try {
    if (mode === 'settings') {
      const patch: Record<string, unknown> = {};
      const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : null);
      if (arr(body.device_calendar_ids)) patch.device_calendar_ids = arr(body.device_calendar_ids);
      if (arr(body.import_share_calendar_ids)) patch.import_share_calendar_ids = arr(body.import_share_calendar_ids);
      if (typeof body.export_enabled === 'boolean') patch.export_enabled = body.export_enabled;
      if (typeof body.export_calendar_id === 'string') patch.export_calendar_id = body.export_calendar_id;
      if (arr(body.export_member_ids)) patch.export_member_ids = arr(body.export_member_ids);
      if (arr(body.export_categories)) patch.export_categories = arr(body.export_categories)!.filter((c) => CATEGORIES.includes(c));
      if (typeof body.export_reminder_minutes === 'number') patch.export_reminder_minutes = Math.max(-1, Math.min(1440, Math.round(body.export_reminder_minutes)));
      if (Object.keys(patch).length) await db.User.update(user.id, patch);
      // Sharing changed: the imported events follow the calendar's setting.
      if (patch.import_share_calendar_ids) {
        const mine = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
        for (const a of mine) {
          const cal = String(a.device_key || '').split(':')[1] || '';
          const want = (patch.import_share_calendar_ids as string[]).includes(cal) ? 'family' : 'private';
          if (a.visibility !== want) await db.Appointment.update(a.id, { visibility: want, last_changed_at: new Date().toISOString() });
        }
      }
      const after = (await db.User.filter({ id: user.id }))?.[0] || user;
      return Response.json({ ok: true, settings: pick(after) });
    }

    if (mode === 'import') {
      const calendarIds: string[] = (Array.isArray(body.calendarIds) ? body.calendarIds : []).map(String).filter(Boolean);
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (!calendarIds.length) return Response.json({ ok: true, created: 0, updated: 0, removed: 0, skipped: 'no_calendars' });
      const shareIds: string[] = Array.isArray(user.import_share_calendar_ids) ? user.import_share_calendar_ids.map(String) : [];
      // Rows GenCare itself wrote to this phone (exports) must not come back as imports.
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const exportedIds = new Set(links.map((l: any) => String(l.device_event_id || '')).filter(Boolean));
      const existing = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
      const byKey = new Map(existing.map((a: any) => [a.device_key, a]));
      const seen = new Set<string>();
      let created = 0, updated = 0, removed = 0;
      const horizon = addDays(todayIn(tz), DAYS_AHEAD);
      for (const row of rows) {
        const cal = String(row.calendarId || '');
        if (!calendarIds.includes(cal)) continue;
        if (exportedIds.has(String(row.id || ''))) continue;
        if (isHolidayFeed(row.calendarName || '')) continue;
        const key = row.originalId
          ? `${user.id}:${cal}:${row.originalId}_${row.originalInstanceTime || row.dtstart || 0}`
          : `${user.id}:${cal}:${row.id}`;
        const fields = rowToAppointment(row, cal, tz, shareIds.includes(cal), user);
        if (!fields) continue;
        if (fields.date > horizon) continue;
        seen.add(key);
        const have = byKey.get(key);
        if (have) {
          if (!fieldsMatch(have, fields)) {
            const keep: Record<string, unknown> = { ...fields };
            // What the family changed here stays: who it's for, the category, visibility if shared by hand.
            if (have.family_member_id) { delete keep.family_member_id; }
            if (have.category && have.category !== 'Other') delete keep.category;
            if (have.visibility === 'family' && !shareIds.includes(cal)) delete keep.visibility;
            await db.Appointment.update(have.id, keep);
            updated++;
          }
        } else {
          // The same thing already added by hand (title, day, time): link rather than duplicate.
          const twin = ((await db.Appointment.filter({ family_id: familyId, date: fields.date, title: fields.title })) || [])
            .find((a: any) => (a.time || '') === (fields.time || '') && !a.device_key);
          if (twin) {
            await db.Appointment.update(twin.id, { device_key: key, source: 'phone', created_by_user_id: twin.created_by_user_id || user.id });
            updated++;
          } else {
            await db.Appointment.create({ ...fields, family_id: familyId, device_key: key });
            created++;
          }
        }
      }
      // Gone from the phone (in a calendar we were sent): gone here.
      for (const a of existing) {
        const cal = String(a.device_key || '').split(':')[1] || '';
        if (!calendarIds.includes(cal) || seen.has(a.device_key)) continue;
        await db.Appointment.delete(a.id);
        removed++;
      }
      return Response.json({ ok: true, created, updated, removed, synced_at: new Date().toISOString() });
    }

    if (mode === 'export_pull') {
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      const deletes: string[] = [];
      const events: any[] = [];
      if (!user.export_enabled || !user.export_calendar_id) {
        // Export off: whatever GenCare wrote to the phone comes off it.
        for (const l of links) {
          if (l.status === 'written' && l.device_event_id) deletes.push(String(l.device_event_id));
        }
        return Response.json({ ok: true, calendarId: '', events, deletes, exporting: false });
      }
      const from = addDays(todayIn(tz), -DAYS_BACK);
      const to = addDays(todayIn(tz), DAYS_AHEAD);
      const all = (await db.Appointment.filter({ family_id: familyId })) || [];
      const wanted = new Map<string, any>();
      for (const a of all) {
        if (!a.date || a.date < from || a.date > to) continue;
        if (a.visibility === 'private' && a.created_by_user_id !== user.id && a.created_by_id !== user.id) continue;
        // Came from this person's own phone: it's already there.
        if (a.source === 'phone' && (a.created_by_user_id === user.id || a.created_by_id === user.id)) continue;
        if (!passesFilter(a, user)) continue;
        wanted.set(a.id, a);
      }
      const reminder = typeof user.export_reminder_minutes === 'number' ? user.export_reminder_minutes : 30;
      for (const a of wanted.values()) {
        const link = byAppt.get(a.id);
        const forWhom = a.family_member_name ? `${a.family_member_name}: ` : '';
        const title = `${forWhom}${a.title}`;
        const description = [a.notes || '', a.doctor_name ? `With ${a.doctor_name}` : '', 'Added from GenCare'].filter(Boolean).join('\n');
        const eventTz = a.timezone ? safeTz(a.timezone) : tz;
        const startMs = a.all_day ? utcDay(a.date) : localToMs(a.date, a.time || '09:00', eventTz);
        let endMs = 0;
        if (a.all_day) endMs = (a.end_date && a.end_date > a.date ? utcDay(a.end_date) : startMs) + 86_400_000;
        else if (a.end_time) endMs = localToMs(a.end_date || a.date, a.end_time, eventTz);
        if (!startMs) continue;
        if (!endMs || endMs <= startMs) endMs = startMs + (a.all_day ? 86_400_000 : 3_600_000);
        const hash = await hashOf([title, description, a.location || '', startMs, endMs, a.all_day ? 1 : 0, reminder, user.export_calendar_id].join('|'));
        if (link && link.status === 'written' && link.written_hash === hash && link.device_calendar_id === user.export_calendar_id) continue;
        if (link && link.status === 'written' && link.device_event_id && link.device_calendar_id && link.device_calendar_id !== user.export_calendar_id) {
          // Moved to another calendar: the old row goes, a new one is written.
          deletes.push(String(link.device_event_id));
        }
        events.push({
          key: a.id,
          title, description,
          location: a.location || '',
          startMs, endMs,
          allDay: !!a.all_day,
          timezone: a.timezone || tz,
          reminderMinutes: a.all_day ? -1 : reminder,
          deviceEventId: link && link.device_calendar_id === user.export_calendar_id ? (link.device_event_id || '') : '',
          hash,
        });
        if (!link) {
          await db.CalendarExportLink.create({ user_id: user.id, family_id: familyId, appointment_id: a.id, device_calendar_id: user.export_calendar_id, status: 'pending' });
        } else if (link.status !== 'pending' || link.device_calendar_id !== user.export_calendar_id) {
          await db.CalendarExportLink.update(link.id, { status: 'pending', device_calendar_id: user.export_calendar_id, written_hash: '' });
        }
      }
      // No longer wanted (deleted, made private, filtered out): off the phone.
      for (const l of links) {
        if (wanted.has(l.appointment_id)) continue;
        if (l.status === 'written' && l.device_event_id) {
          deletes.push(String(l.device_event_id));
          await db.CalendarExportLink.update(l.id, { status: 'delete_pending' });
        } else if (l.status === 'pending' || l.status === 'failed') {
          await db.CalendarExportLink.delete(l.id);
        }
      }
      return Response.json({ ok: true, calendarId: String(user.export_calendar_id), events, deletes: [...new Set(deletes)], exporting: true });
    }

    if (mode === 'export_report') {
      const results: any[] = Array.isArray(body.results) ? body.results : [];
      const deleted: string[] = (Array.isArray(body.deleted) ? body.deleted : []).map(String);
      const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
      const byAppt = new Map(links.map((l: any) => [l.appointment_id, l]));
      let written = 0, failed = 0, cleared = 0;
      const now = new Date().toISOString();
      for (const r of results) {
        const link = byAppt.get(String(r.key || ''));
        if (!link) continue;
        if (r.ok && r.deviceEventId) {
          await db.CalendarExportLink.update(link.id, { status: 'written', device_event_id: String(r.deviceEventId), device_calendar_id: user.export_calendar_id || link.device_calendar_id, written_hash: String(r.hash || body.hashes?.[r.key] || ''), written_at: now, error: '' });
          written++;
        } else {
          await db.CalendarExportLink.update(link.id, { status: 'failed', error: String(r.error || 'unknown'), written_at: now });
          failed++;
        }
      }
      for (const l of links) {
        if (deleted.includes(String(l.device_event_id || '')) && (l.status === 'delete_pending' || !user.export_enabled)) {
          await db.CalendarExportLink.delete(l.id);
          cleared++;
        }
      }
      return Response.json({ ok: true, written, failed, cleared });
    }

    // status
    const links = (await db.CalendarExportLink.filter({ user_id: user.id })) || [];
    const imported = (await db.Appointment.filter({ family_id: familyId, source: 'phone', created_by_user_id: user.id })) || [];
    return Response.json({
      ok: true,
      settings: pick(user),
      imported: imported.length,
      exported: links.filter((l: any) => l.status === 'written').length,
      pending: links.filter((l: any) => l.status === 'pending').length,
      failed: links.filter((l: any) => l.status === 'failed').length,
    });
  } catch (e) {
    console.error('[phoneCalendar]', mode, (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

function pick(u: any) {
  return {
    device_calendar_ids: u.device_calendar_ids || [],
    import_share_calendar_ids: u.import_share_calendar_ids || [],
    export_enabled: !!u.export_enabled,
    export_calendar_id: u.export_calendar_id || '',
    export_member_ids: u.export_member_ids || [],
    export_categories: u.export_categories || [],
    export_reminder_minutes: typeof u.export_reminder_minutes === 'number' ? u.export_reminder_minutes : 30,
  };
}

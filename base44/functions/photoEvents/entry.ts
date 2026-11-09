import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { accessOf } from '../../shared/access.ts';

// Add to the calendar from a photo (Anna, Nov 9 2026): an appointment card, a
// school calendar, a flyer, a screenshot of a text. The app shrinks the
// photo(s) and sends them here; this reads every dated thing on them and
// hands back the events for the person to check before anything is added.
// Nothing is saved here, and the photo isn't kept.
//
//   { images: ["data:image/jpeg;base64,..."], today: "YYYY-MM-DD", timezone }
//   -> { ok, events: [{ title, date, time, end_time, all_day, location, with,
//        notes, member_id, recurrence, check }], note }

const MODEL = 'gpt-6-astra';
const BACKUP_MODEL = 'gpt-6-luna';
const MAX_IMAGES = 8; // pieces: the app cuts a long screenshot into a few
const MAX_IMAGE_CHARS = 6_000_000; // about 4.5 MB of photo, after the app shrinks it
const MAX_EVENTS = 40;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const SYSTEM = `You read photos people take so their family calendar has everything on it: appointment cards and reminder slips, school and sports calendars, flyers, discharge papers, letters, screenshots of texts and emails. Find every dated thing worth putting on a calendar and return it as JSON only.

Rules:
- Only what the photo actually says. Never invent a date, time, place or name. If something is unreadable or missing, leave that field empty and say so in "check".
- A date with no year is the next time that date comes, on or after today. "Tomorrow", "next Tuesday" and the like count from today.
- No time shown: all_day true and time "".
- title: short, the way a person writes it on a calendar ("Dentist", "Eye doctor follow-up", "Field trip", "Picture day"). Don't put the date or time in it.
- with: the doctor, teacher, coach or person it's with, if named.
- location: the place as written, with the full address when one is shown. When the place is only a code or part of an address ("7112-C Austin"), put the business or clinic name from the page in front of it so it can be found on a map.
- notes: what they need to know or bring: prep instructions, what to bring, phone number, confirmation or account number shown for this event, cost. Short. Empty when there's nothing.
- member_id: the id of the family member it's for, only when the photo names them (a patient, student or player name, or "Mom"/"Dad" when that's clear). Otherwise "".
- repeats: only when the photo says it repeats ("every Tuesday", "Mon/Wed/Fri through May 15"). freq is "daily", "weekly" or "monthly"; days are two-letter weekdays (MO TU WE TH FR SA SU) for weekly; until is the last date if shown. Otherwise freq "".
- Several dates for the same thing listed out (a season schedule) are separate events unless the photo says it's a weekly repeat.
- check: a few words when something needs a second look ("year not shown", "time hard to read"), otherwise "".
- note: if there's nothing dated in the photo, one short plain sentence saying what you see instead. Otherwise "".`;

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function ruleOf(rep: any, date: string): string {
  const freq = String(rep?.freq || '').toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(freq)) return '';
  let rule = `RRULE:FREQ=${freq.toUpperCase()}`;
  if (freq === 'weekly') {
    const days = (Array.isArray(rep?.days) ? rep.days : []).map((d: unknown) => String(d).toUpperCase().slice(0, 2)).filter((d: string) => DAYS.includes(d));
    if (days.length) rule += `;BYDAY=${[...new Set(days)].join(',')}`;
  }
  const until = String(rep?.until || '');
  if (DAY.test(until) && until >= date) rule += `;UNTIL=${until.replace(/-/g, '')}`;
  return rule;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const user = (await db.User.filter({ id: me.id }))?.[0] || me;
    if (!user.family_id) return Response.json({ ok: false, error: 'No family' }, { status: 400 });
    const fam = (await db.Family.filter({ id: user.family_id }))?.[0];
    if (!accessOf(fam, user).access) return Response.json({ ok: false, error: 'no_access' }, { status: 402 });

    const body = await req.json().catch(() => ({}));
    const images = (Array.isArray(body?.images) ? body.images : [])
      .map(String)
      .filter((s: string) => /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length <= MAX_IMAGE_CHARS)
      .slice(0, MAX_IMAGES);
    if (!images.length) return Response.json({ ok: false, error: 'no_image' }, { status: 400 });
    const tz = String(body?.timezone || user.timezone || 'America/Chicago');
    const today = DAY.test(String(body?.today || '')) ? String(body.today)
      : new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    // What the person typed alongside ("these are all at ...", "for Mom").
    const hint = clip(body?.hint, 300);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${today}T12:00:00Z`));

    // Who's in the family, so "Patient: ..." can land on the right person.
    const members = ((await db.FamilyMember.filter({ family_id: user.family_id })) || [])
      .filter((m: any) => m.is_active !== false)
      .map((m: any) => ({ id: m.id, name: clip(m.name, 60), relationship: clip(m.relationship, 30) }));

    const prompt = `Today is ${weekday}, ${today}.${hint ? `\nThe person adding these says: "${hint}". Follow it (for example, a place or person they name goes on every event it applies to).` : ''}${images.length > 1 ? `\nThe ${images.length} images are pieces of the same photo or of photos taken together, in order; an event cut across two pieces is one event.` : ''}
Family members (id, name, relationship to the person adding this):
${members.map((m: any) => `- ${m.id}: ${m.name}${m.relationship ? ` (${m.relationship})` : ''}`).join('\n') || '- none'}

Return JSON: { "events": [ { "title": "", "date": "YYYY-MM-DD", "time": "HH:MM or empty", "end_time": "HH:MM or empty", "all_day": false, "location": "", "with": "", "notes": "", "member_id": "", "repeats": { "freq": "", "days": [], "until": "" }, "check": "" } ], "note": "" }`;

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return Response.json({ ok: false, error: 'Not set up' }, { status: 500 });
    const openai = lean(new OpenAI({ apiKey, timeout: 90000, maxRetries: 0 }), { name: 'photoEvents' });
    let parsed: any = null;
    let lastError: unknown = null;
    for (const model of [MODEL, BACKUP_MODEL]) {
      try {
        const res: any = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((url: string) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] },
          ],
          response_format: { type: 'json_object' },
          reasoning_effort: 'low',
          max_completion_tokens: 12000,
        } as any);
        parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
        break;
      } catch (e) {
        lastError = e;
        console.warn(`[photoEvents] ${model} failed:`, (e as Error)?.message || e);
      }
    }
    if (!parsed) return Response.json({ ok: false, error: String((lastError as Error)?.message || 'Could not read the photo') }, { status: 502 });

    const ids = new Set(members.map((m: any) => m.id));
    const events = [];
    const seen = new Set<string>(); // a row in the overlap of two pieces comes back twice
    for (const e of Array.isArray(parsed?.events) ? parsed.events : []) {
      const date = String(e?.date || '');
      const title = clip(e?.title, 120);
      if (!DAY.test(date) || !title) continue;
      const time = TIME.test(String(e?.time || '')) ? String(e.time) : '';
      const end = TIME.test(String(e?.end_time || '')) ? String(e.end_time) : '';
      const allDay = !time || e?.all_day === true;
      const key = `${date}|${allDay ? '' : time}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        title,
        date,
        time: allDay ? '' : time,
        end_time: !allDay && end && end > time ? end : '',
        all_day: allDay,
        location: clip(e?.location, 200),
        with: clip(e?.with, 80),
        notes: clip(e?.notes, 600),
        member_id: ids.has(String(e?.member_id || '')) ? String(e.member_id) : '',
        recurrence: ruleOf(e?.repeats, date),
        check: clip(e?.check, 80),
      });
      if (events.length >= MAX_EVENTS) break;
    }
    events.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
    console.log(`[photoEvents] ${user.email}: ${images.length} photo(s), ${events.length} event(s)`);
    return Response.json({ ok: true, events, note: events.length ? '' : clip(parsed?.note, 200) });
  } catch (e) {
    console.error('[photoEvents]', (e as Error)?.message || e);
    return Response.json({ ok: false, error: (e as Error)?.message || 'Something went wrong' }, { status: 500 });
  }
});

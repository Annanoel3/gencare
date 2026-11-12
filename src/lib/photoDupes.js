import { visitKinds } from '@/lib/eventTitle';

// Is something read from a photo already on the calendar? (Anna, Nov 10 2026:
// "if somebody uploads a photo and then uploads another photo and there's
// duplicates in there, it just skips those. But make sure it doesn't skip
// things that actually aren't duplicates.")
//
// Already there means all of these:
//   - the same day, and the same start time (or both all day). A different
//     time is never a duplicate;
//   - not for two different people (Dad's 9:30 isn't Mom's 9:30);
//   - it looks like the same thing: when both are a kind of visit GenCare
//     knows (PT, OT, speech, dentist, eye, vet, doctor...), the same kind (the
//     9:30 PT is never the 9:30 OT). Otherwise it's for the same person (no
//     one is in two places at once), or they share a real word of the title
//     ("Spero"), the place's name, or who it's with.
// Separately, the same kind of visit for the same person on the same day at
// another time is flagged as maybe moved, so the old one can be deleted.

const GENERIC = new Set([
  'with', 'from', 'that', 'this', 'your', 'about', 'only', 'today', 'tomorrow', 'appointment', 'appt', 'visit',
  'session', 'therapy', 'therapist', 'follow', 'followup', 'checkup', 'meeting', 'call', 'class', 'lesson',
  'practice', 'doctor', 'clinic', 'center', 'centre', 'rehab', 'health', 'medical', 'office', 'hospital',
  'central', 'north', 'south', 'east', 'west', 'the',
]);
const wordsOf = (s) => (String(s || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !GENERIC.has(w));
const titleWords = (s) => new Set(wordsOf(s).filter((w) => w.length >= 4));
// The place's own name, its first real word: "Spero Rehab Central Austin, ..." -> "spero".
const placeKey = (s) => wordsOf(String(s || '').split(',')[0])[0] || '';
const withKey = (s) => (String(s || '').trim().toLowerCase().match(/[a-z]+/) || [''])[0];
const withOf = (a) => a?.doctor_name || String(a?.notes || '').match(/^with\s+(.+)$/im)?.[1] || '';
const hm = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};
const startOf = (a) => (a?.all_day || !hm(a?.time) ? '' : hm(a.time));
const overlap = (x, y) => [...x].some((v) => y.has(v));
// A merged row that stands in for someone's private event: compare the real one.
const realTitle = (a) => a?.own?.title || a?.title || '';

function samePlaceOrPerson(photo, cal) {
  if (overlap(titleWords(photo.title), titleWords(realTitle(cal)))) return true;
  const pp = placeKey(photo.location);
  if (pp && pp === placeKey(cal.location)) return true;
  const pw = withKey(photo.with);
  return !!pw && pw === withKey(withOf(cal));
}

/** The same thing at the same time? `person` is who the photo's event will be for ('' for nobody). */
export function isSameEvent(photo, cal, person) {
  if (!photo?.date || photo.date !== cal?.date) return false;
  if (photo.all_day ? !(cal.all_day || !hm(cal.time)) : startOf(cal) !== hm(photo.time)) return false;
  const calPerson = cal.family_member_id || '';
  if (person && calPerson && person !== calPerson) return false;
  const pk = visitKinds(photo.title);
  const ck = visitKinds(realTitle(cal));
  if (pk.size && ck.size) return overlap(pk, ck);
  if (person && calPerson === person) return true;
  return samePlaceOrPerson(photo, cal);
}

/** The same kind of visit, same person, same day, another time: maybe it moved. */
function maybeMoved(photo, cal, person) {
  if (!photo?.date || photo.date !== cal?.date || photo.all_day || !startOf(cal) || startOf(cal) === hm(photo.time)) return false;
  const calPerson = cal.family_member_id || '';
  if (person && calPerson && person !== calPerson) return false;
  const pk = visitKinds(photo.title);
  const ck = visitKinds(realTitle(cal));
  if (!pk.size || !ck.size || !overlap(pk, ck)) return false;
  return (!!person && calPerson === person) || samePlaceOrPerson(photo, cal);
}

/**
 * For each event read from a photo: `dup`, the calendar event it already is
 * (or null), and `moved`, a calendar event of the same kind that day at
 * another time that nothing else in the photo matches (or null).
 * `calendar` is every occurrence on those days (repeating events expanded,
 * stand-ins and "traveling" rows left out); `personOf(e)` is who it'll be for.
 */
export function matchCalendar(found, calendar, personOf) {
  const cal = (calendar || []).filter((a) => a && !a.away_of && !a.cover_of);
  const dups = found.map((e) => cal.find((a) => isSameEvent(e, a, personOf(e))) || null);
  const taken = new Set(dups.filter(Boolean).map((a) => a.id));
  return found.map((e, i) => ({
    dup: dups[i],
    moved: dups[i] ? null : cal.find((a) => !taken.has(a.id) && maybeMoved(e, a, personOf(e))) || null,
  }));
}

// The place's name as written before the first comma, for telling one clinic
// from another ("Spero Rehab Central Austin" isn't "Spero Rehab Dripping Springs").
const placeName = (s) => String(s || '').split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A changed schedule (Anna, Nov 12 2026: the therapy place changed it and she
 * had to cancel and re-put in a bunch of events): what's on the calendar from
 * today through the photo's last day, at the same place, for the same person
 * and the same kind of visit, that the new photo doesn't have. Never anything
 * that repeats, came from a phone calendar, or is one of GenCare's stand-ins.
 * Nothing at all when the photo has no place, since then there's no telling
 * which visits it covers. `rows` are the photo's events with their `dup`.
 */
export function notOnSchedule(rows, calendar, { place, personOf, today }) {
  const dates = (rows || []).map((e) => e.date).filter(Boolean).sort();
  if (!dates.length) return [];
  const from = dates[0] > today ? dates[0] : today;
  const to = dates[dates.length - 1];
  const places = new Set(rows.map((e) => placeName(place || e.location)).filter(Boolean));
  if (!places.size) return [];
  const kinds = new Set(rows.flatMap((e) => [...visitKinds(e.title)]));
  const people = new Set(rows.map((e) => personOf(e)).filter(Boolean));
  const kept = new Set(rows.map((e) => e.dup?.id).filter(Boolean));
  const seen = new Set();
  return (calendar || []).filter((a) => {
    if (!a?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    if (a.away_of || a.cover_of || a.occurrence_of || a.recurrence || a.source === 'phone') return false;
    if (!a.date || a.date < from || a.date > to || kept.has(a.id)) return false;
    if (!places.has(placeName(a.location))) return false;
    if (a.family_member_id && people.size && !people.has(a.family_member_id)) return false;
    const k = visitKinds(a.title);
    return !kinds.size || !k.size || [...k].some((x) => kinds.has(x));
  }).sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time || '').localeCompare(String(y.time || '')));
}

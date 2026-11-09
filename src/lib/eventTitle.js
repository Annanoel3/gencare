import { isPet, isCareEvent } from '@/utils/memberColors';

// An event's title without the name of the person it's for, where that person
// is already shown by their color or name next to it (Anna, Nov 9 2026: "The
// calendar is so small that ... all you can see is the word mom. I'd rather it
// be like the physical therapy events ... It just said physical therapy and
// assigned it to my mom"). "Mom's Speech Therapy" for Mom shows as "Speech
// Therapy", "Mom cardiologist" as "Cardiologist", "PT - Mom" as "PT". Only
// the start or end of the title, and only the name or "Mom"/"Dad"-type word
// of the person it's assigned to; "Dad & Mom dinner" stays as it is. Pets
// share one color, so a pet's name stays. The saved title never changes.

const BY_RELATIONSHIP = [
  [/^(mother|mom|mum)$/i, ['mom', 'mommy', 'mama', 'mother', 'mum']],
  [/^(father|dad)$/i, ['dad', 'daddy', 'papa', 'father']],
  [/^(grandmother|grandma)$/i, ['grandma', 'granny', 'nana', 'grandmother']],
  [/^(grandfather|grandpa)$/i, ['grandpa', 'granddad', 'grandad', 'grandfather']],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function shortTitle(appt, members = []) {
  const title = String(appt?.title || '');
  const m = appt?.family_member_id ? (members || []).find((x) => x.id === appt.family_member_id) : null;
  if (!title || !m || isPet(m)) return title;
  const full = String(m.name || '').trim();
  const words = new Set([full, full.split(/\s+/)[0] || ''].filter((w) => w.length >= 2).map((w) => w.toLowerCase()));
  for (const [rel, list] of BY_RELATIONSHIP) if (rel.test(String(m.relationship || '').trim())) list.forEach((w) => words.add(w));
  if (!words.size) return title;
  const alt = [...words].sort((a, b) => b.length - a.length).map(esc).join('|');
  // "Mom PT", "Mom's PT", "Mom: PT", "Mom - PT" (not "Mom and Dad ...")
  const lead = new RegExp(`^\\s*(?:${alt})(?:['’]?s)?(?:\\s*[:\\-–—]\\s*|\\s+)(?!(?:and|or|&|\\+)(?:\\s|$))(?=[\\p{L}\\p{N}])`, 'iu');
  // "PT - Mom", "PT (Mom)", "Pick up refill for Mom"
  const tail = new RegExp(`(?:\\s*[:\\-–—]\\s*|\\s*\\(\\s*|\\s+for\\s+)(?:${alt})(?:['’]?s)?\\s*\\)?\\s*$`, 'iu');
  let out = title.replace(lead, '');
  if (out === title) out = title.replace(tail, '');
  out = out.trim();
  if (out === title.trim() || out.length < 2) return title;
  return out.charAt(0).toLocaleUpperCase() + out.slice(1);
}

// A small picture for the kind of care visit, in front of the title (Anna,
// Nov 9 2026: "any way to easily make all pt and ot a certain color? Or have
// an emoji?"). Colors stay one per person, so this is how a PT visit and an
// OT visit look different at a glance, even cut off in Month view. Care
// events only (an "OT shift" at work gets none), from the title alone, and
// nothing for counseling or other sensitive visits. PT, OT and speech can
// show together ("Spero PT & OT"); otherwise the first match.
const THERAPY = [
  [/\b(pt|physical\s+therap\w*|physio\w*)\b/i, '🦵'],
  [/\b(ot|occupational\s+therap\w*)\b/i, '✋'],
  [/\bspeech\b/i, '🗣️'],
];
const OTHER = [
  [/\b(dentist\w*|dental|orthodont\w*)\b/i, '🦷'],
  [/\b(eye|eyes|optometr\w*|ophthalm\w*|vision)\b/i, '👁️'],
  [/\b(vet|vets|veterinar\w*)\b/i, '🐾'],
  [/\b(blood\s*work|blood\s+draw|lab\s*work)\b/i, '🩸'],
  [/\b(pharmacy|prescriptions?|refills?|meds)\b/i, '💊'],
  [/(\bdr\.?\s|\bdoctor\b|\bcardiolog\w*|\bneurolog\w*|\bdermatolog\w*|\bphysician\b|\bcheck-?up\b)/i, '🩺'],
];

export function kindEmoji(appt) {
  const title = String(appt?.title || '');
  if (!title || !isCareEvent(appt) || /^\s*\p{Extended_Pictographic}/u.test(title)) return '';
  const therapy = THERAPY.filter(([re]) => re.test(title)).map(([, e]) => e);
  if (therapy.length) return therapy.slice(0, 2).join('');
  return OTHER.find(([re]) => re.test(title))?.[1] || '';
}

/** The title as shown: the kind's emoji, then the title (without the person's name when `short`). */
export function shownTitle(appt, members = [], short = true) {
  const t = short ? shortTitle(appt, members) : String(appt?.title || '');
  const e = kindEmoji(appt);
  return e ? `${e} ${t}` : t;
}

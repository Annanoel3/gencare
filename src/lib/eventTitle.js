import { isPet } from '@/utils/memberColors';

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

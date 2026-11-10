import { format, parseISO, isValid, isToday, differenceInMonths } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// The care log is one page for every person the family takes care of (Anna,
// Nov 10 2026: back from hidden, trimmed to what's useful, plus what baby
// trackers log that she'd never have thought of); what you can log depends on
// the person's age. Each band below lists its entry types and the fields each one
// asks for, so the dialog and the list render from this catalog and a person
// who ages out of a band (a baby turning two) simply gets the next band's
// tiles while keeping every entry already logged.

export const BANDS = {
  baby: { label: 'Baby', from: 0, to: 24 },
  toddler: { label: 'Toddler', from: 24, to: 72 },
  school: { label: 'School age', from: 72, to: 108 },
  preteen: { label: 'Pre-teen', from: 108, to: 156 },
  teen: { label: 'Teen', from: 156, to: 216 },
  adult: { label: 'Adult', from: 216, to: 780 },
  // Shown to nobody: the label under a person's name is just their age
  // (Anna, Oct 29 2026: her mom doesn't like being called a senior).
  senior: { label: 'Adult', from: 780, to: Infinity },
  general: { label: 'Care', from: null, to: null },
  pet: { label: 'Pet', from: null, to: null },
};

export function ageMonths(birthdate) {
  if (!birthdate) return null;
  const d = parseISO(birthdate);
  return isValid(d) ? differenceInMonths(new Date(), d) : null;
}

/** Which band a person is in today. No birthdate → 'general'. Pets → 'pet'. */
export function bandOf(member) {
  if (/^pet$/i.test(String(member?.relationship || ''))) return 'pet';
  const m = ageMonths(member?.birthdate);
  if (m === null || m < 0) return 'general';
  for (const [key, b] of Object.entries(BANDS)) {
    if (b.from === null) continue;
    if (m >= b.from && m < b.to) return key;
  }
  return 'general';
}

// Field kinds the dialog knows how to draw.
// text | textarea | number | minutes | money | select | date | time | mood | level | toggle | url | side
const MOOD = { key: 'mood', kind: 'mood', label: 'Mood' };
const NOTES = { key: 'notes', kind: 'textarea', label: 'Notes' };
const TITLE = (label, placeholder) => ({ key: 'title', kind: 'text', label, placeholder, required: true });
const SUB = (label, options) => ({ key: 'sub_type', kind: 'select', label, options });
const MIN = (label = 'Minutes') => ({ key: 'minutes', kind: 'minutes', label });
const AMOUNT = (label, unit) => ({ key: 'amount', kind: unit === '$' ? 'money' : 'number', label, unit });
const DUE = { key: 'due_date', kind: 'date', label: 'Due' };
const DATE = (label) => ({ key: 'date', kind: 'date', label });
const TIME = (label = 'Time') => ({ key: 'time', kind: 'time', label });
const DONE = { key: 'completed', kind: 'toggle', label: 'Done' };
const DOC = { key: 'doc_url', kind: 'url', label: 'Document link' };
const CONTACT = (label = 'Contact') => ({ key: 'contact', kind: 'text', label });
// A plain note: anything worth writing down that no other tile fits.
// What was given and how much, so two people don't both give a dose ("Last
// time" shows it). A log, not a reminder: daily ones go in Reminders.
const MEDICINE = { type: 'medicine', label: 'Medicine', icon: '💊', fields: [TITLE('Medicine', 'e.g. vitamin D drops'), { key: 'response', kind: 'text', label: 'How much', placeholder: 'e.g. 1 mL' }, NOTES] };
const NOTE = { type: 'note', label: 'Note', icon: '📝', fields: [TITLE('What', 'e.g. what you noticed today'), NOTES, { key: 'photos', kind: 'photos', label: 'Photos' }] };

export const CATALOG = {
  baby: [
    { type: 'feeding', label: 'Feeding', icon: '🍼', fields: [
      SUB('How', ['nursing', 'bottle', 'solid']),
      { key: 'side', kind: 'side', label: 'Side', when: (f) => f.sub_type === 'nursing' },
      { key: 'amount', kind: 'number', label: 'Amount', unit: 'oz', step: 0.5, when: (f) => f.sub_type !== 'nursing' },
      { ...MIN('Minutes'), when: (f) => f.sub_type !== 'solid' },
      NOTES,
    ] },
    { type: 'pumping', label: 'Pumping', icon: '🫙', fields: [{ key: 'side', kind: 'side', label: 'Side' }, { key: 'amount', kind: 'number', label: 'Amount', unit: 'oz', step: 0.5 }, MIN(), NOTES] },
    // Poop color (Nov 10 2026): what baby trackers ask for; parents read it.
    { type: 'diaper', label: 'Diaper', icon: '🧷', fields: [SUB('Type', ['wet', 'dirty', 'mixed']), { key: 'color', kind: 'select', label: 'Color', options: ['yellow', 'green', 'brown', 'pale', 'red_or_black'], when: (f) => f.sub_type !== 'wet' }, NOTES] },
    { type: 'tummy_time', label: 'Tummy time', icon: '🤸', fields: [MIN(), NOTES] },
    MEDICINE,
    { type: 'solids', label: 'Solids', icon: '🥄', fields: [TITLE('Food', 'e.g. avocado'), { key: 'first_time', kind: 'toggle', label: 'First time trying it' }, { key: 'response', kind: 'text', label: 'Any reaction', placeholder: 'e.g. none, a little rash' }, NOTES] },
    { type: 'bath', label: 'Bath', icon: '🛁', fields: [NOTES] },
    { type: 'temperature', label: 'Temperature', icon: '🌡️', fields: [{ key: 'value', kind: 'number', label: 'Temperature', unit: '°F', step: 0.1 }, NOTES] },
    { type: 'sleep', label: 'Sleep', icon: '😴', whenLabel: 'Fell asleep', fields: [SUB('Type', ['nap', 'night']), MIN('Minutes asleep'), NOTES] },
    { type: 'growth', label: 'Growth', icon: '📏', fields: [
      { key: 'value', kind: 'number', label: 'Weight', unit: 'lb', step: 0.1 },
      { key: 'value_b', kind: 'number', label: 'Length', unit: 'in', step: 0.1 },
      { key: 'value_c', kind: 'number', label: 'Head', unit: 'in', step: 0.1 },
      NOTES,
    ] },
    { type: 'teething', label: 'Teething', icon: '🦷', fields: [SUB('Tooth', ['front_bottom', 'front_top', 'side', 'molar', 'unsure']), { key: 'level', kind: 'level', label: 'How fussy (1–5)' }, NOTES] },
    { type: 'milestone', label: 'Milestone', icon: '🎯', fields: [SUB('Area', ['motor', 'speech', 'social']), TITLE('What happened', 'e.g. rolled over, first smile'), NOTES] },
    { type: 'memory', label: 'Memory', icon: '📸', fields: [TITLE('Moment', 'e.g. first beach day'), NOTES, { key: 'photos', kind: 'photos', label: 'Photos' }] },
    NOTE,
  ],
  toddler: [
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    { type: 'potty', label: 'Potty', icon: '🚽', fields: [SUB('Result', ['attempt', 'success', 'accident']), NOTES] },
    { type: 'milestone', label: 'Milestone', icon: '🎯', fields: [SUB('Area', ['speech', 'motor', 'social']), TITLE('What happened', 'e.g. first full sentence'), NOTES] },
    { type: 'sleep', label: 'Sleep', icon: '😴', fields: [SUB('Type', ['nap', 'night', 'bedtime_routine']), MIN('Minutes asleep'), NOTES] },
    { type: 'food', label: 'Food', icon: '🍽️', fields: [SUB('Meal', ['breakfast', 'lunch', 'dinner', 'snack']), TITLE('What they ate', 'e.g. pasta, peas, half a banana'), NOTES] },
    MEDICINE,
    NOTE,
  ],
  // School age through teens (Nov 10 2026): homework, chores, rides,
  // activities and paperwork live in To-do and the Calendar; puberty, showers
  // and a teen's money aren't the family's to log.
  school: [
    { type: 'reading', label: 'Reading', icon: '📚', fields: [TITLE('Book', 'e.g. Magic Tree House #4'), MIN(), NOTES] },
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    MEDICINE,
    NOTE,
  ],
  preteen: [
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    MEDICINE,
    NOTE,
  ],
  teen: [
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    MEDICINE,
    NOTE,
  ],
  adult: [
    { type: 'care_log', label: 'Care log', icon: '📋', fields: [SUB('What', ['meal', 'errand', 'hygiene', 'mobility', 'fall', 'visit', 'hand_off', 'other']), TITLE('Details', 'e.g. lunch, walked to mailbox'), { key: 'given_by', kind: 'text', label: 'Helped by', placeholder: 'e.g. a neighbor' }, NOTES] },
    { type: 'activity', label: 'Activity', icon: '🏃', fields: [TITLE('Activity', 'e.g. walk around the block'), MIN(), { key: 'level', kind: 'level', label: 'How it went (1–5)' }, NOTES] },
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    NOTE,
  ],
  senior: [
    { type: 'care_log', label: 'Care log', icon: '📋', fields: [SUB('What', ['meal', 'errand', 'hygiene', 'mobility', 'fall', 'visit', 'hand_off', 'other']), TITLE('Details', 'e.g. breakfast, walked to the mailbox'), { key: 'given_by', kind: 'text', label: 'Helped by', placeholder: 'e.g. a neighbor' }, NOTES] },
    { type: 'activity', label: 'Activity', icon: '🏃', fields: [TITLE('Activity', 'e.g. walk around the block'), MIN(), { key: 'level', kind: 'level', label: 'How it went (1–5)' }, NOTES] },
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    NOTE,
  ],
  pet: [
    { type: 'pet_feeding', label: 'Fed', icon: '🥣', fields: [TITLE('What', 'e.g. breakfast, half a can'), { key: 'given_by', kind: 'text', label: 'Fed by' }, NOTES] },
    { type: 'pet_walk', label: 'Walk & play', icon: '🐾', fields: [TITLE('What', 'e.g. walk around the block'), MIN(), { key: 'given_by', kind: 'text', label: 'By' }, NOTES] },
    { type: 'pet_vet', label: 'Vet', icon: '🩺', fields: [TITLE('What', 'e.g. ear check, shots'), DATE('Date'), AMOUNT('Cost', '$'), NOTES] },
    { type: 'pet_grooming', label: 'Grooming', icon: '✂️', fields: [TITLE('What', 'e.g. nails trimmed, bath'), NOTES] },
    NOTE,
  ],
  general: [
    { type: 'care_log', label: 'Care log', icon: '📋', fields: [TITLE('Details', 'What you did or noticed'), { key: 'given_by', kind: 'text', label: 'Helped by' }, NOTES] },
    { type: 'mood', label: 'Mood', icon: '💭', fields: [MOOD, NOTES] },
    NOTE,
  ],
};

// Legal & financial moved into the locked folder (lib/vault.js). Entries
// saved before that stay out of lists and move in once the folder is opened.
export const isLocked = (e) => e?.entry_type === 'legal';

/** Find a type definition; falls back across bands so old entries still render. */
export function typeDef(band, type) {
  return (CATALOG[band] || []).find((t) => t.type === type) || Object.values(CATALOG).flat().find((t) => t.type === type) || { type, label: pretty(type), icon: '📝', fields: [NOTES] };
}

export const pretty = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const MOODS = [
  { value: 'happy', emoji: '😊' }, { value: 'calm', emoji: '😌' }, { value: 'anxious', emoji: '😰' }, { value: 'irritable', emoji: '😤' }, { value: 'upset', emoji: '😢' },
];
export const moodEmoji = (m) => MOODS.find((x) => x.value === m)?.emoji || '';

export function nowLocal() {
  const d = new Date(); d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Dialog form → row. Only the fields this type asks for are kept. */
export function cleanLog(form, def, member, me) {
  const row = {
    family_member_id: member.id,
    family_member_name: member.name,
    band: bandOf(member),
    entry_type: def.type,
    timestamp: new Date(form.timestamp || Date.now()).toISOString(),
    logged_by_user_id: me?.id,
    logged_by_name: me?.display_name || me?.full_name || '',
  };
  for (const f of def.fields) {
    if (f.when && !f.when(form)) continue;
    const v = form[f.key];
    if (v === '' || v === undefined || v === null) continue;
    if (['number', 'minutes', 'money', 'level'].includes(f.kind)) { const n = Number(v); if (!Number.isNaN(n)) row[f.key] = n; if (f.unit) row.unit = f.unit; }
    else row[f.key] = v;
  }
  return row;
}

export async function createLog(row) { return base44.entities.CareLog.create(withFamily(row)); }
export async function updateLog(id, row) { return base44.entities.CareLog.update(id, row); }
export async function deleteLog(id) { return base44.entities.CareLog.delete(id); }

/** One line that sums up an entry for lists and the home feed. */
export function summarize(e) {
  // A reading in "Track something": its name and what was typed.
  if (e?.entry_type === 'tracker') return { icon: '📈', label: e.title || 'Reading', detail: e.response || '' };
  const def = typeDef(e.band, e.entry_type);
  const bits = [];
  // "Lunch", "Walk", "Took her to the post office" read better as the line
  // itself than as "Care log · Meal · Lunch".
  const titled = !!e.title && ['care_log', 'activity', 'pet_feeding', 'pet_walk', 'pet_grooming', 'pet_vet'].includes(e.entry_type);
  if (e.sub_type && !(titled && ['meal', 'hygiene'].includes(e.sub_type))) bits.push(pretty(e.sub_type));
  if (e.title && !titled) bits.push(e.title);
  if (e.mood) bits.push(`${moodEmoji(e.mood)} ${pretty(e.mood)}`);
  if (typeof e.amount === 'number') bits.push(e.unit === '$' ? `$${e.amount.toFixed(2)}` : `${e.amount}${e.unit ? ` ${e.unit}` : ''}`);
  if (typeof e.minutes === 'number') bits.push(`${e.minutes} min`);
  // A nursing timer keeps minutes per side (BabyTimers).
  if (e.entry_type === 'feeding' && e.sub_type === 'nursing' && (typeof e.value === 'number' || typeof e.value_b === 'number') && (e.value || e.value_b)) bits.push(`L ${Math.round(e.value || 0)} · R ${Math.round(e.value_b || 0)} min`);
  else if (typeof e.value === 'number' && e.entry_type === 'growth') bits.push(`${e.value} lb${e.value_b ? ` · ${e.value_b} in` : ''}`);
  else if (typeof e.value === 'number' && e.entry_type !== 'feeding') bits.push(`${e.value}${e.unit && e.unit !== '$' ? ` ${e.unit}` : ''}`);
  if (typeof e.level === 'number') bits.push(`${e.level}/5`);
  if (e.side) bits.push(pretty(e.side));
  if (e.color) bits.push(pretty(e.color).replace(' or ', '/'));
  if (e.first_time) bits.push('first time');
  if (e.grade) bits.push(`grade ${e.grade}`);
  if (e.response) bits.push(e.response);
  if (e.completed) bits.push('✓ done');
  // A running timer (sleep, nursing) says so; a finished one needs no "Done".
  if (['sleep', 'feeding'].includes(e.entry_type)) { if (e.status === 'pending') bits.push('going now'); }
  else if (e.status && e.status !== 'pending') bits.push(pretty(e.status));
  if (e.due_date) bits.push(`due ${format(parseISO(e.due_date), 'MMM d')}`);
  else if (e.date) bits.push(format(parseISO(e.date), 'MMM d'));
  const q = quickFor(e);
  return { icon: q?.icon || def.icon, label: titled ? e.title : def.label, detail: bits.join(' · ') };
}

/** Entries with a future date (pickups, deadlines, paperwork), soonest first. */
export function upcoming(logs) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return logs
    .filter((l) => (l.due_date && l.due_date >= today && !l.completed) || (l.date && l.date >= today && l.status !== 'done' && !['puberty', 'financial', 'legal'].includes(l.entry_type)))
    .sort((a, b) => (a.due_date || a.date).localeCompare(b.due_date || b.date));
}

// ---- One-tap logging ----
// The Care Log's buttons: a tap logs it right now, as you, for the person
// picked, and everyone in the family sees it (Undo and "Add details" follow).
// `ask` opens the form instead, for things that need a detail (how much, how
// long, what happened). `daily` things (meals, a shower) that were already
// logged today open that entry instead of logging a second one. `last` puts
// it in "Last time" (when did Mom last shower, when did the baby last eat).
const Q = (key, label, icon, row, opts = {}) => ({ key, label, icon, row, ...opts });
const meal = (key, label, icon, type = 'care_log') => Q(key, label, icon, type === 'food' ? { entry_type: 'food', sub_type: key, title: label } : { entry_type: 'care_log', sub_type: 'meal', title: label }, { daily: true });
const GOOD = Q('good', 'Good day', '😊', { entry_type: 'mood', mood: 'happy' }, { mood: ['happy', 'calm'] });
const HARD = Q('hard', 'Hard day', '😔', { entry_type: 'mood', mood: 'upset' }, { mood: ['anxious', 'irritable', 'upset'] });
const NOTE_Q = Q('note', 'Note', '📝', { entry_type: 'note' }, { ask: true });

export const QUICK = {
  senior: [
    meal('breakfast', 'Breakfast', '🍳'), meal('lunch', 'Lunch', '🥪'), meal('dinner', 'Dinner', '🍽️'),
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('exercises', 'Exercises', '💪', { entry_type: 'activity', title: 'Exercises' }, { last: true }),
    Q('shower', 'Shower', '🚿', { entry_type: 'care_log', sub_type: 'hygiene', title: 'Shower' }, { daily: true, last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD,
    Q('fall', 'Fall', '⚠️', { entry_type: 'care_log', sub_type: 'fall', title: 'Fall' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  adult: [
    meal('breakfast', 'Breakfast', '🍳'), meal('lunch', 'Lunch', '🥪'), meal('dinner', 'Dinner', '🍽️'),
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('exercises', 'Exercises', '💪', { entry_type: 'activity', title: 'Exercises' }, { last: true }),
    Q('shower', 'Shower', '🚿', { entry_type: 'care_log', sub_type: 'hygiene', title: 'Shower' }, { daily: true, last: true }),
    Q('errand', 'Errand', '🛒', { entry_type: 'care_log', sub_type: 'errand', title: 'Errand' }, { ask: true, last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD,
    // A fall can happen at any age the family looks after (Nov 10 2026).
    Q('fall', 'Fall', '⚠️', { entry_type: 'care_log', sub_type: 'fall', title: 'Fall' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  baby: [
    Q('bottle', 'Bottle', '🍼', { entry_type: 'feeding', sub_type: 'bottle' }, { ask: true, last: true }),
    Q('nursing', 'Nursing', '🤱', { entry_type: 'feeding', sub_type: 'nursing' }, { ask: true, last: true }),
    Q('wet', 'Wet diaper', '💧', { entry_type: 'diaper', sub_type: 'wet' }, { last: true }),
    // Asks, for the color (Nov 10 2026).
    Q('dirty', 'Dirty diaper', '💩', { entry_type: 'diaper', sub_type: 'dirty' }, { ask: true, last: true }),
    Q('nap', 'Nap', '😴', { entry_type: 'sleep', sub_type: 'nap' }, { ask: true, last: true }),
    Q('tummy', 'Tummy time', '🤸', { entry_type: 'tummy_time' }, { ask: true, last: true }),
    Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true }),
    Q('pumping', 'Pumping', '🫙', { entry_type: 'pumping' }, { ask: true, last: true }),
    Q('bath', 'Bath', '🛁', { entry_type: 'bath' }, { last: true }),
    // Solid food starts around 4 to 6 months; before that it's in "Something else".
    Q('solids', 'Solids', '🥄', { entry_type: 'solids' }, { ask: true, last: true, minMonths: 4 }),
    NOTE_Q,
  ],
  toddler: [
    meal('breakfast', 'Breakfast', '🍳', 'food'), meal('lunch', 'Lunch', '🥪', 'food'), meal('dinner', 'Dinner', '🍽️', 'food'),
    Q('nap', 'Nap', '😴', { entry_type: 'sleep', sub_type: 'nap' }, { last: true }),
    Q('potty', 'Potty win', '🚽', { entry_type: 'potty', sub_type: 'success' }, { last: true }),
    Q('accident', 'Accident', '💦', { entry_type: 'potty', sub_type: 'accident' }),
    GOOD, HARD,
    Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true }),
    Q('milestone', 'Milestone', '🎯', { entry_type: 'milestone' }, { ask: true }),
    NOTE_Q,
  ],
  school: [
    Q('reading', 'Reading', '📚', { entry_type: 'reading' }, { ask: true, last: true }),
    GOOD, HARD,
    Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  preteen: [
    GOOD, HARD,
    Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  teen: [
    GOOD, HARD,
    Q('medicine', 'Medicine', '💊', { entry_type: 'medicine' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  pet: [
    Q('fed', 'Fed', '🥣', { entry_type: 'pet_feeding', title: 'Fed' }, { last: true }),
    Q('walk', 'Walk', '🐾', { entry_type: 'pet_walk', title: 'Walk' }, { last: true }),
    Q('groomed', 'Groomed', '✂️', { entry_type: 'pet_grooming', title: 'Groomed' }, { last: true }),
    Q('vet', 'Vet', '🩺', { entry_type: 'pet_vet' }, { ask: true, last: true }),
    NOTE_Q,
  ],
  general: [
    Q('walk', 'Walk', '🚶', { entry_type: 'activity', title: 'Walk' }, { last: true }),
    Q('visit', 'Visit', '👋', { entry_type: 'care_log', sub_type: 'visit', title: 'Visit' }, { last: true }),
    GOOD, HARD, NOTE_Q,
  ],
};

/** Does this entry count as that button (for "done today" and "Last time")? */
export function matchesQuick(q, e) {
  if (!e || e.entry_type !== q.row.entry_type) return false;
  if (q.mood) return q.mood.includes(e.mood);
  if (q.row.sub_type && e.sub_type !== q.row.sub_type) return false;
  // Where buttons share a kind (Walk and Exercises are both activities, the
  // three meals are all meals), the title tells them apart.
  const byTitle = q.row.title && (q.row.entry_type === 'activity' || ['meal', 'hygiene'].includes(q.row.sub_type));
  if (byTitle && !String(e.title || '').toLowerCase().startsWith(q.row.title.toLowerCase())) return false;
  return true;
}

/** A one-tap button's entry, ready to save. */
export function quickRow(q, member, me) {
  return {
    family_member_id: member.id,
    family_member_name: member.name,
    band: bandOf(member),
    timestamp: new Date().toISOString(),
    logged_by_user_id: me?.id,
    logged_by_name: me?.display_name || me?.full_name || '',
    ...q.row,
  };
}

/** The one-tap button an entry came from (or matches), for its icon. */
function quickFor(e) {
  for (const list of [QUICK[e?.band] || [], ...Object.values(QUICK)]) {
    const q = list.find((x) => !x.mood && x.key !== 'note' && matchesQuick(x, e));
    if (q) return q;
  }
  return null;
}

import { format, parseISO, isValid, isToday, isYesterday } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// The care journal: notes about the people being cared for, written by whoever
// is with them, shared with the whole family. Each entry says who wrote it and
// who it's about; photos go to private storage (signed URLs to view).

export const CATEGORIES = [
  { value: 'Observation', icon: '👀' },
  { value: 'Symptom', icon: '🩺' },
  { value: 'Doctor Note', icon: '📋' },
  { value: 'Behavior', icon: '🧠' },
  { value: 'Mood', icon: '💭' },
  { value: 'Milestone', icon: '🎯' },
  { value: 'General', icon: '📝' },
];
export const categoryIcon = (c) => CATEGORIES.find((x) => x.value === c)?.icon || '📝';

export const MOODS = [
  { value: 'great', emoji: '😄', label: 'Great' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'poor', emoji: '😟', label: 'Poor' },
  { value: 'bad', emoji: '😢', label: 'Bad' },
];
export const moodEmoji = (m) => MOODS.find((x) => x.value === m)?.emoji || '';

export const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/** The fields that say who wrote something. */
export function authorOf(me) {
  return { author_user_id: me?.id, author_name: me?.display_name || me?.full_name || me?.email || '' };
}

/** Turn the dialog form into a row. */
export function cleanEntry(form, members, me) {
  const member = members.find((m) => m.id === form.family_member_id);
  return {
    content: (form.content || '').trim(),
    category: form.category || 'General',
    mood: form.mood || null,
    family_member_id: form.family_member_id || null,
    family_member_name: member?.name || '',
    is_important: !!form.is_important,
    entry_date: form.entry_date || todayStr(),
    photos: Array.isArray(form.photos) ? form.photos : [],
    ...(form.id ? {} : authorOf(me)),
  };
}

export async function createEntry(form, members, me) {
  return base44.entities.CareJournal.create(withFamily(cleanEntry(form, members, me)));
}

export async function updateEntry(id, form, members, me) {
  return base44.entities.CareJournal.update(id, cleanEntry(form, members, me));
}

export async function deleteEntry(id) {
  return base44.entities.CareJournal.delete(id);
}

/** Upload a photo to private storage; returns its file URI. */
export async function uploadPhoto(file) {
  const res = await base44.integrations.Core.UploadPrivateFile({ file });
  return res?.file_uri || null;
}

/** The day an entry is about (entry_date, else the day it was written). */
export function entryDay(e) {
  if (e.entry_date) return e.entry_date;
  const d = e.created_date ? parseISO(e.created_date) : null;
  return d && isValid(d) ? format(d, 'yyyy-MM-dd') : todayStr();
}

export function dayLabel(day) {
  const d = parseISO(day);
  if (!isValid(d)) return day;
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEEE, MMM d' : 'EEE, MMM d, yyyy');
}

/** Entries grouped by day, newest day first, newest entry first within a day. */
export function groupByDay(entries) {
  const map = new Map();
  for (const e of entries) {
    const day = entryDay(e);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => [day, list.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))]);
}

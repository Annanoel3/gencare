import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { serverDate, serverMs } from '@/lib/serverTime';

// The family feed ("Feed" in the app; Anna, Nov 10 2026): posts and replies,
// with an unread count for the tab, and announcements.

export const CATEGORIES = [
  { value: 'Update', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { value: 'Announcement', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { value: 'Question', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { value: 'Care Update', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { value: 'Visit Summary', color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  { value: 'Photo', color: 'bg-pink-500/10 text-pink-700 dark:text-pink-300' },
  { value: 'Task', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  { value: 'General', color: 'bg-gray-500/10 text-gray-700 dark:text-gray-300' },
];
export const categoryColor = (c) => CATEGORIES.find((x) => x.value === c)?.color || CATEGORIES.at(-1).color;

export const MESSAGES_KEY = ['familyMessages'];

export function listMessages() {
  return base44.entities.FamilyMessage.list('-created_date', 200);
}

export async function postMessage({ content, category, member, photos, parentId, taskId, announceDays, announceAt }, me) {
  const row = withFamily({
    content: content.trim(),
    category: category || 'General',
    author_user_id: me?.id,
    author_name: me?.display_name || me?.full_name || me?.email || 'Me',
    family_member_id: member?.id || null,
    family_member_name: member?.name || '',
    photos: photos || [],
    parent_id: parentId || null,
    task_id: taskId || null,
  });
  // An announcement (not a reply to one) goes to the top of everyone's Home
  // for a few days; notifyFamily sends it to everyone right away. One set for
  // later (announceAt) stays out of sight until then, and the 15-minute cron
  // (cronReminders) sends it at that time.
  const later = category === 'Announcement' && !parentId && announceAt instanceof Date && announceAt.getTime() > Date.now() + 60_000;
  if (category === 'Announcement' && !parentId) {
    row.announce_until = announceUntil(announceDays, later ? announceAt : new Date());
    if (later) row.announce_at = announceAt.toISOString();
  }
  const created = await base44.entities.FamilyMessage.create(row);
  // The rest of the family hears about it (notifyFamily skips the author).
  if (created?.id && !later) base44.functions.invoke('notifyFamily', { kind: 'message', message_id: created.id }).catch(() => {});
  return created;
}

/** When a post went (or goes) out: an announcement set for later counts from then. */
export const postedAt = (m) => m?.announce_at || m?.created_date || '';

/** An announcement set for a time that hasn't come yet. */
export function isScheduled(m, now = new Date()) {
  const at = serverDate(m?.announce_at);
  return !!at && at > now;
}

/** What a person sees in the Feed: everything except other people's announcements that haven't gone out yet. */
export function shownMessages(messages, me, now = new Date()) {
  return (messages || []).filter((m) => !isScheduled(m, now) || (me && m.author_user_id === me.id));
}

export async function editMessage(id, content) {
  return base44.entities.FamilyMessage.update(id, { content: content.trim(), edited_at: new Date().toISOString() });
}

export async function deleteMessage(msg, all) {
  // A post takes its replies with it.
  const replies = (all || []).filter((m) => m.parent_id === msg.id);
  for (const r of replies) await base44.entities.FamilyMessage.delete(r.id);
  return base44.entities.FamilyMessage.delete(msg.id);
}

export async function togglePin(msg) {
  return base44.entities.FamilyMessage.update(msg.id, { is_pinned: !msg.is_pinned });
}

// ── Announcements (Anna, Nov 10 2026: "a person can post an announcement to
// the family ... at the top of Today Across the Family. And it will send a
// notification with the announcement to everyone instantly.") ──────────────
// A feed post in the Announcement category. It also stays in the Feed, where
// people can reply. On Home it shows until `announce_until`, or until that
// person taps Got it (kept on their account, so it's gone on every phone);
// whoever posted it can take it down for everyone.
export const ANNOUNCE_DAYS = [1, 3, 7];
export const announceUntil = (days = 3, from = new Date()) => new Date(from.getTime() + (ANNOUNCE_DAYS.includes(days) ? days : 3) * 86400000).toISOString();

export function activeAnnouncements(messages, me, now = new Date()) {
  const done = new Set(Array.isArray(me?.announcements_done) ? me.announcements_done : []);
  return (messages || [])
    .filter((m) => m.category === 'Announcement' && !m.parent_id && !done.has(m.id) && !isScheduled(m, now))
    .filter((m) => { const until = serverDate(m.announce_until); return !!until && until > now; })
    .sort((a, b) => serverMs(postedAt(b)) - serverMs(postedAt(a)));
}

/** This person's own announcements that are set for later, soonest first. */
export function scheduledAnnouncements(messages, me, now = new Date()) {
  return (messages || [])
    .filter((m) => m.category === 'Announcement' && !m.parent_id && me && m.author_user_id === me.id && isScheduled(m, now))
    .sort((a, b) => serverMs(a.announce_at) - serverMs(b.announce_at));
}

/** Send one that was set for later right now (it keeps the same number of days on Home). */
export async function sendAnnouncementNow(m) {
  const at = serverMs(m.announce_at);
  const until = serverMs(m.announce_until);
  const keep = at && until > at ? until - at : 3 * 86400000;
  const now = Date.now();
  await base44.entities.FamilyMessage.update(m.id, { announce_at: new Date(now).toISOString(), announce_until: new Date(now + keep).toISOString() });
  await base44.functions.invoke('notifyFamily', { kind: 'message', message_id: m.id }).catch(() => {});
}

/** Got it: off this person's Home (the last 50 are remembered). */
export async function markAnnouncementDone(me, id) {
  const list = [...new Set([...(Array.isArray(me?.announcements_done) ? me.announcements_done : []), id])].slice(-50);
  await base44.auth.updateMe({ announcements_done: list });
  return list;
}

/** Off everyone's Home; it stays in the Feed. */
export function takeDownAnnouncement(id) {
  return base44.entities.FamilyMessage.update(id, { announce_until: new Date().toISOString() });
}

/** Posts newer than the last time this person opened the Feed, by other people. */
export function countUnread(messages, me) {
  if (!me) return 0;
  const since = serverMs(me.messages_seen_at);
  const now = new Date();
  return (messages || []).filter((m) => m.author_user_id !== me.id && !isScheduled(m, now) && serverMs(postedAt(m)) > since).length;
}

/** For the sidebar badge: polls the feed every minute. */
export function useUnreadMessages(me) {
  const q = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages, refetchInterval: 60_000, enabled: !!me });
  return countUnread(q.data, me);
}

/** Mark the feed read now; the badge clears on the next render. */
export async function markMessagesSeen(me, queryClient, refreshFamily) {
  const now = new Date().toISOString();
  try { await base44.auth.updateMe({ messages_seen_at: now }); } catch { /* badge just stays */ }
  if (refreshFamily) refreshFamily();
  if (queryClient) queryClient.invalidateQueries({ queryKey: ['me'] });
}

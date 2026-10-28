import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// The family feed: posts and replies, with an unread count for the sidebar.

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

export async function postMessage({ content, category, member, photos, parentId, taskId }, me) {
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
  const created = await base44.entities.FamilyMessage.create(row);
  // The rest of the family hears about it (notifyFamily skips the author).
  if (created?.id) base44.functions.invoke('notifyFamily', { kind: 'message', message_id: created.id }).catch(() => {});
  return created;
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

/** Posts newer than the last time this person opened Messages, by other people. */
export function countUnread(messages, me) {
  if (!me) return 0;
  const since = me.messages_seen_at || '';
  return (messages || []).filter((m) => m.author_user_id !== me.id && (m.created_date || '') > since).length;
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

// The same event on two calendars, shown once (the home-screen widgets).
// Twin of mergeSameEvents in src/lib/sameEvent.js; change both together.
//
// The copy that says the most leads. A person's own private event with
// GenCare's "<name>: doctor" stand-in for the family shows as what the family
// sees (Anna, Oct 30 2026: "I want my calendar to show what the family is
// seeing").

import { sameEvent } from './sameEvent.ts';

const titleDetail = (t: unknown) => String(t || '').replace(/^\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*/i, '').trim().length;
const detail = (a: any) => (a.cover_of ? -1000 : 0) + titleDetail(a.title) * 4 + (a.location ? 10 : 0) + (a.notes ? 5 : 0) + (a.end_time ? 1 : 0);
// A stand-in always goes with the event it stands for.
const linked = (a: any, b: any) => (!!a.cover_of && a.cover_of === b.id) || (!!b.cover_of && b.cover_of === a.id);

export function mergeSameEvents(list: any[]): any[] {
  const rows = Array.isArray(list) ? list : [];
  const out: any[] = [];
  const used = new Set<string>();
  const order = (x: any, y: any) => detail(y) - detail(x) || String(x.created_date || '').localeCompare(String(y.created_date || ''));
  for (const a of rows) {
    if (used.has(a.id)) continue;
    const group = [a, ...rows.filter((b) => !used.has(b.id) && b.id !== a.id && (linked(a, b) || sameEvent(a, b)))];
    if (group.length === 1) { out.push(a); continue; }
    group.forEach((g) => used.add(g.id));
    const [keep, ...others] = [...group].sort(order);
    const cover = keep.cover_of || keep.visibility !== 'private' ? null
      : others.find((o) => o.cover_of === keep.id) || others.find((o) => o.cover_of);
    if (cover) {
      out.push({
        ...keep,
        title: cover.title,
        visibility: cover.visibility || 'family',
        shared_with: cover.shared_with || [],
        family_member_id: keep.family_member_id || cover.family_member_id || '',
        family_member_name: keep.family_member_id ? keep.family_member_name || '' : cover.family_member_name || '',
      });
      continue;
    }
    out.push({
      ...keep,
      end_time: keep.end_time || others.find((o) => o.end_time)?.end_time || '',
      family_member_id: keep.family_member_id || others.find((o) => o.family_member_id)?.family_member_id || '',
      family_member_name: keep.family_member_name || others.find((o) => o.family_member_name)?.family_member_name || '',
    });
  }
  return out;
}

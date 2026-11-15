// Short names on chips that still tell people apart (Anna, Nov 14 2026, from the
// audit for older family members: two chips both said "David"). First names,
// a last initial when two people share a first name ("David C."), and when
// that still matches, their relationship ("David (Son)").

const firstOf = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const initialOf = (s) => {
  const parts = String(s || '').trim().split(/\s+/);
  return parts.length > 1 && parts[parts.length - 1] ? `${parts[parts.length - 1][0].toUpperCase()}.` : '';
};

/** A family member's or account's whole name. */
export const fullNameOf = (p) => String(p?.name || p?.display_name || p?.full_name || p?.email || '').trim();

/**
 * people: family members and/or accounts ({ id, name | display_name | full_name, relationship? }),
 * all the ones that show side by side. Returns a Map of id -> the short name to show.
 */
export function shortNames(people = []) {
  const out = new Map();
  const groups = new Map();
  for (const p of people) {
    if (!p?.id) continue;
    const key = firstOf(fullNameOf(p)).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const group of groups.values()) {
    if (group.length === 1) { out.set(group[0].id, firstOf(fullNameOf(group[0])) || '?'); continue; }
    const withInitial = group.map((p) => [firstOf(fullNameOf(p)), initialOf(fullNameOf(p))].filter(Boolean).join(' '));
    const apart = new Set(withInitial.map((x) => x.toLowerCase())).size === group.length;
    group.forEach((p, i) => {
      const rel = String(p.relationship || '').trim();
      out.set(p.id, apart || !rel ? withInitial[i] || '?' : `${firstOf(fullNameOf(p))} (${rel})`);
    });
  }
  return out;
}

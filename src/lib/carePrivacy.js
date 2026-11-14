import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { youngerThan18 } from '@/components/family/CaredForSwitch';
import { QUICK, matchesQuick, bandOf } from '@/lib/careLog';

// Tracking things for yourself in the Care Log (Anna, Nov 13 2026: "allow
// users to track things for themself even if they are not being cared for",
// "And each thing tracked can be made visible or private").
//
// Your own profile is always in your Care Log. Each thing you track there (a
// one-tap button, or one of your "Track something" trackers) is either Only
// you or Family. An entry saved as Only you has visibility "private", and the
// CareLog access rules let only the person who logged it see it (the widget's
// server checks the same: base44/shared/careQuick.ts).
// A thing starts as Only you, unless the family helps take care of you (then
// your log is the family's, like before). Your choices are kept on your own
// account (User.care_private_keys / care_shared_keys), which only you can
// read, so a tracker's name stays yours too.

const isPet = (m) => /^pet$/i.test(String(m?.relationship || ''));

/** Someone the family takes care of: their profile says so, or they're under 18 and it doesn't say otherwise, or a pet. */
export const caredFor = (m) => isPet(m) || m?.cared_for === true || (m?.cared_for !== false && youngerThan18(m?.birthdate));

/** Your own profile (the one linked to your account). */
export const isMine = (m, me) => !!me?.id && !!m?.linked_user_id && m.linked_user_id === me.id;

export const isPrivate = (e) => e?.visibility === 'private';

export const buttonKey = (q) => `b:${q.key}`;
export const trackerKey = (name) => `t:${String(name || '').trim().toLowerCase()}`;

/** The thing an entry belongs to: its tracker, or the button it matches, or its kind. */
export function thingOf(e, band) {
  if (e?.entry_type === 'tracker') return trackerKey(e.title);
  for (const list of [QUICK[band] || [], ...Object.values(QUICK)]) {
    const q = list.find((x) => matchesQuick(x, e));
    if (q) return buttonKey(q);
  }
  return `e:${e?.entry_type || ''}`;
}

const KEY = ['carePrivacy'];
const list = (v) => (Array.isArray(v) ? v.map(String) : []);
const fetchChoices = async () => {
  const u = await base44.auth.me();
  return { priv: list(u?.care_private_keys), shared: list(u?.care_shared_keys) };
};
const decide = (choices, key, member) => (choices.priv.includes(key) ? true : choices.shared.includes(key) ? false : !caredFor(member));

/**
 * Your Only you / Family choices.
 *   isPrivateThing(key, member)   for showing (the default until they've loaded)
 *   privateNow(key, member)       for saving (waits for them)
 *   setThing(key, makePrivate, { member, logs, meId })
 *       saves the choice and changes what you already logged with it; returns how many changed
 */
export function useCarePrivacy() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: fetchChoices, staleTime: 5 * 60_000 });
  const choices = data || { priv: [], shared: [] };

  const isPrivateThing = (key, member) => decide(choices, key, member);
  const privateNow = async (key, member) => {
    try { return decide(await qc.ensureQueryData({ queryKey: KEY, queryFn: fetchChoices }), key, member); } catch { return decide(choices, key, member); }
  };
  const setThing = async (key, makePrivate, { member, logs = [], meId }) => {
    const before = qc.getQueryData(KEY) || choices;
    const next = {
      priv: makePrivate ? [...new Set([...before.priv, key])] : before.priv.filter((k) => k !== key),
      shared: makePrivate ? before.shared.filter((k) => k !== key) : [...new Set([...before.shared, key])],
    };
    qc.setQueryData(KEY, next);
    try {
      await base44.auth.updateMe({ care_private_keys: next.priv, care_shared_keys: next.shared });
    } catch (e) {
      qc.setQueryData(KEY, before);
      throw e;
    }
    // What you already logged with it goes the same way. Entries someone else
    // logged about you stay theirs.
    // (All of them, not just the ones on the screen.)
    const band = bandOf(member);
    const want = makePrivate ? 'private' : 'family';
    let rows = logs;
    try { rows = (await base44.entities.CareLog.filter({ family_member_id: member.id, logged_by_user_id: meId }, '-timestamp', 5000)) || logs; } catch { /* the ones on the screen */ }
    const change = rows.filter((l) => l.family_member_id === member.id && l.logged_by_user_id === meId && l.entry_type !== 'legal' && thingOf(l, band) === key && (l.visibility || 'family') !== want);
    for (let i = 0; i < change.length; i += 10) {
      await Promise.all(change.slice(i, i + 10).map((l) => base44.entities.CareLog.update(l.id, { visibility: want })));
    }
    return change.length;
  };
  return { ready: !!data, isPrivateThing, privateNow, setThing };
}

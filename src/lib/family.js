import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { appBuild, phonePlatform } from '@/lib/phone';
import { osName } from '@/lib/activity';

// The family this account belongs to, loaded once per app open from the
// `family` backend function, and the family_id every new record must carry
// (the entities' RLS refuses a row without the right one).

const FamilyContext = createContext(null);
let currentFamilyId = '';
let currentUserId = '';
let currentUserName = '';

export const PENDING_INVITE_KEY = 'gencare_pending_invite';

export function getFamilyId() {
  return currentFamilyId;
}

// Add to every create(): { ...data, family_id }. Also stamps who made it
// where the entity has those fields (harmless on the ones that don't).
export function withFamily(data) {
  const out = { ...(data || {}), family_id: currentFamilyId };
  if (!out.created_by_user_id && currentUserId) out.created_by_user_id = currentUserId;
  if (!out.created_by_name && currentUserName) out.created_by_name = currentUserName;
  return out;
}

export function FamilyProvider({ children }) {
  const [state, setState] = useState({ loading: true, family: null, me: null, members: [], access: null, error: null });
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let pending = '';
      try { pending = localStorage.getItem(PENDING_INVITE_KEY) || ''; } catch (e) { pending = ''; }
      let timezone = '';
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { timezone = ''; }
      const build = await appBuild();
      const res = await base44.functions.invoke('family', { mode: 'ensure', pending_invite: pending || undefined, timezone: timezone || undefined, app_build: build || undefined, platform: phonePlatform(), os: osName() || undefined });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Could not load your family');
      if (pending) { try { localStorage.removeItem(PENDING_INVITE_KEY); } catch (e) { /* fine */ } }
      currentFamilyId = data.family?.id || '';
      currentUserId = data.me?.id || '';
      currentUserName = data.me?.display_name || data.me?.full_name || '';
      setState({ loading: false, family: data.family, me: data.me, members: data.members || [], access: data.access, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Could not load your family' }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(() => ({
    ...state,
    refresh: load,
    hasAccess: !!state.access?.access,
    // Apply a result the `family` function already returned (join, leave).
    apply: (data) => {
      if (!data?.family) return;
      currentFamilyId = data.family.id || currentFamilyId;
      if (data.me) {
        currentUserId = data.me.id || currentUserId;
        currentUserName = data.me.display_name || data.me.full_name || currentUserName;
      }
      setState((s) => ({ ...s, family: data.family, me: data.me || s.me, members: data.members || s.members, access: data.access || s.access }));
    },
  }), [state, load]);

  return React.createElement(FamilyContext.Provider, { value }, children);
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used inside FamilyProvider');
  return ctx;
}

// Household helpers: all go through the backend so RLS and the owner rules hold.
// With a profile's id, the invite is for that person: when they join with it,
// the profile the family made for them becomes theirs.
export async function createInvite(memberId) {
  const res = await base44.functions.invoke('family', { mode: 'invite', member_id: memberId || undefined });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not make an invite');
  return data.invite;
}

export async function joinFamily(code) {
  const res = await base44.functions.invoke('family', { mode: 'join', code });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not join');
  return data;
}

// A profile's relationship as shown to `meId`: a person's own profile
// ("Self") reads "You" to them and nothing to everyone else.
export function relationshipLabel(member, meId) {
  if (/^self$/i.test(String(member?.relationship || ''))) return member?.linked_user_id && member.linked_user_id === meId ? 'You' : '';
  return member?.relationship || '';
}

// Profiles in the order people expect: you, then the rest of the people
// (oldest profile first), then the pets.
export function orderMembers(members = [], meId) {
  const pet = (m) => /^pet$/i.test(String(m?.relationship || ''));
  const rank = (m) => (m.linked_user_id && m.linked_user_id === meId ? 0 : pet(m) ? 2 : 1);
  return [...members].sort((a, b) => rank(a) - rank(b)
    || String(a.created_date || '').localeCompare(String(b.created_date || ''))
    || String(a.id).localeCompare(String(b.id)));
}

// "None of these are me": the person's own profile.
export async function makeMyProfile() {
  const res = await base44.functions.invoke('family', { mode: 'make_my_profile' });
  return res?.data || res;
}

// "This profile is me" (for someone who joined without their profile's invite).
export async function claimProfile(memberId) {
  const res = await base44.functions.invoke('family', { mode: 'claim_profile', member_id: memberId });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not make that profile yours');
  return data;
}

export async function lookupInvite(code) {
  const res = await base44.functions.invoke('family', { mode: 'lookup', code });
  return res?.data || res;
}

export async function renameFamily(name) {
  const res = await base44.functions.invoke('family', { mode: 'rename', name });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not rename');
  return data.family;
}

export async function removeMember(userId) {
  const res = await base44.functions.invoke('family', { mode: 'remove_member', user_id: userId });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not remove');
  return data.members;
}

export async function leaveFamily() {
  const res = await base44.functions.invoke('family', { mode: 'leave' });
  const data = res?.data || res;
  if (!data?.ok) throw new Error(data?.error || 'Could not leave');
  return data;
}

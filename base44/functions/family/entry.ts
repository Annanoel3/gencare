import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { accessOf } from '../../shared/access.ts';

// The family (household) a GenCare account belongs to. Every family-scoped
// record (FamilyMember, Appointment, CareTask, ...) carries family_id, and the
// entities' RLS lets a person read and write only their own family's rows.
// Before this (Oct 2026) GenCare had no household at all: invite codes were
// handed out, but nothing tied two accounts' data together.
//
//   { mode: "ensure", pending_invite? } -> { family, me, members, access }
//        First open: creates a family for a new account (or joins the invite
//        they signed up with) and stamps family_id on anything they made before.
//   { mode: "lookup", code }            -> { family_name, invited_by, member_name }  (no sign-in needed)
//   { mode: "join", code }              -> { family, me }
//   { mode: "invite", member_id? }      -> { invite }  (7-day code; with member_id the
//        invite is for that profile, and whoever joins with it becomes that profile)
//   { mode: "members" }                 -> { members }
//   { mode: "rename", name }            -> { family }
//   { mode: "remove_member", user_id }  -> { ok }  (owner only)
//   { mode: "leave" }                   -> { family, me }  (a fresh family of their own)
//
// Access (the 7-day free trial, then the Family plan) comes from shared/access.ts so
// every screen asks one place: a family has access while its trial runs, while
// any member's subscription is active (functions/premium keeps that in step with
// RevenueCat), or while promo_until is in the future. The app owner always has
// access.

const SCOPED = [
  'FamilyMember', 'Appointment', 'CareTask', 'Medication', 'FamilyMessage',
  'CareJournal', 'Checklist', 'ChecklistItem', 'QuickNote', 'BabyCareLog',
  'ToddlerCareLog', 'SchoolAgeLog', 'PreteenLog', 'TeenLog', 'SeniorLog', 'Invite',
];

const TRIAL_DAYS = 7;

function code6() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function membersOf(db: any, familyId: string) {
  const rows = (await db.User.filter({ family_id: familyId })) || [];
  return rows.map((u: any) => ({
    id: u.id,
    full_name: u.display_name || u.full_name || u.email,
    email: u.email,
    family_role: u.family_role || 'member',
    created_date: u.created_date,
  }));
}

function publicUser(u: any) {
  return {
    id: u.id, email: u.email, full_name: u.full_name, display_name: u.display_name,
    family_id: u.family_id, family_role: u.family_role, role: u.role, timezone: u.timezone,
    onesignal_player_id: u.onesignal_player_id,
    push_enabled: u.push_enabled !== false,
    notify_family_events: u.notify_family_events !== false,
    notify_reminders: u.notify_reminders !== false,
    device_calendar_ids: u.device_calendar_ids || [],
    import_share_calendar_ids: u.import_share_calendar_ids || [],
    export_enabled: !!u.export_enabled,
    export_calendar_id: u.export_calendar_id || '',
    export_member_ids: u.export_member_ids || [],
    export_categories: u.export_categories || [],
    export_reminder_minutes: typeof u.export_reminder_minutes === 'number' ? u.export_reminder_minutes : 30,
    event_sharing_default: ['auto', 'family', 'private'].includes(u.event_sharing_default) ? u.event_sharing_default : '',
    app_build: u.app_build || 0,
  };
}

// Anything this person made before they had a family (or that an old build
// saved without one) joins their family now, so it shows up.
async function backfill(db: any, userId: string, familyId: string) {
  let stamped = 0;
  for (const name of SCOPED) {
    try {
      const rows = (await db[name].filter({ created_by_id: userId })) || [];
      for (const r of rows) {
        if (!r.family_id) {
          await db[name].update(r.id, { family_id: familyId });
          stamped++;
        }
      }
    } catch (_) { /* an entity with nothing in it */ }
  }
  return stamped;
}

async function createFamilyFor(db: any, user: any) {
  const name = user.full_name ? `${user.full_name.split(' ')[0]}'s Family` : 'My Family';
  const family = await db.Family.create({
    name,
    owner_user_id: user.id,
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400e3).toISOString(),
    subscription_active: false,
  });
  await db.User.update(user.id, { family_id: family.id, family_role: 'owner' });
  await backfill(db, user.id, family.id);
  return family;
}

// A profile someone made by hand ("Mom") becomes the account that joins for it:
// FamilyMember.linked_user_id = that account. An invite made for a profile
// links that profile; a plain invite links a profile only when exactly one
// unlinked profile in the family has the same full name as the new account.
// Never links the person who made the invite, never takes a profile that is
// already someone else's, and a person is linked to one profile at most.
async function linkProfile(db: any, user: any, invite: any, familyId: string) {
  if (!user?.id || invite?.created_by_user_id === user.id) return null;
  const members = ((await db.FamilyMember.filter({ family_id: familyId })) || []).filter((m: any) => m.is_active !== false);
  let target: any = null;
  if (invite?.family_member_id) {
    target = members.find((m: any) => m.id === invite.family_member_id) || null;
    if (target?.linked_user_id && target.linked_user_id !== user.id) target = null;
  } else {
    if (members.some((m: any) => m.linked_user_id === user.id)) return null;
    const name = String(user.full_name || user.display_name || '').trim().toLowerCase();
    const same = name ? members.filter((m: any) => !m.linked_user_id && String(m.name || '').trim().toLowerCase() === name) : [];
    if (same.length === 1) target = same[0];
  }
  if (!target) return null;
  if (target.linked_user_id !== user.id) await db.FamilyMember.update(target.id, { linked_user_id: user.id });
  for (const m of members) {
    if (m.id !== target.id && m.linked_user_id === user.id) await db.FamilyMember.update(m.id, { linked_user_id: null });
  }
  return target.id;
}

// Everyone on GenCare has a profile of their own in the family (relationship
// "Self"), so their events can be about them and their color is theirs. Made
// on open, unless the family already made profiles they might be (made by
// someone else, not linked, not a pet): then the app first asks "Is one of
// these you?", and "None of these" makes their own (force).
async function ensureOwnProfile(db: any, user: any, familyId: string, force = false) {
  if (!user?.id || !familyId) return null;
  const members = ((await db.FamilyMember.filter({ family_id: familyId })) || []).filter((m: any) => m.is_active !== false);
  const mine = members.find((m: any) => m.linked_user_id === user.id);
  if (mine) return mine.id;
  if (!force) {
    const maybe = members.filter((m: any) => !m.linked_user_id && !/^pet$/i.test(String(m.relationship || ''))
      && (m.created_by_user_id || m.created_by_id) && (m.created_by_user_id || m.created_by_id) !== user.id);
    if (maybe.length) return null;
  }
  const name = String(user.display_name || user.full_name || String(user.email || '').split('@')[0] || 'Me').trim();
  const made = await db.FamilyMember.create({ family_id: familyId, name, relationship: 'Self', linked_user_id: user.id, is_active: true });
  // Two opens at once can each make one: keep the oldest.
  const now = ((await db.FamilyMember.filter({ family_id: familyId, linked_user_id: user.id })) || [])
    .sort((a: any, b: any) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
  for (const extra of now.slice(1)) { try { await db.FamilyMember.delete(extra.id); } catch (_) { /* the other open got it */ } }
  return now[0]?.id || made?.id || null;
}

// Someone leaving (or removed from) a family: their profile there goes back to
// being a plain profile the family keeps.
async function unlinkProfiles(db: any, userId: string, familyId: string) {
  const mine = ((await db.FamilyMember.filter({ family_id: familyId })) || []).filter((m: any) => m.linked_user_id === userId);
  for (const m of mine) await db.FamilyMember.update(m.id, { linked_user_id: null });
}

async function joinByCode(db: any, user: any, code: string) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Enter the invite code');
  const invites = (await db.Invite.filter({ code: clean, is_active: true })) || [];
  const invite = invites.find((i: any) => i.family_id);
  if (!invite) throw new Error('That invite code is not valid any more');
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) throw new Error('That invite code has expired. Ask for a new one.');
  const fams = await db.Family.filter({ id: invite.family_id });
  const family = fams?.[0];
  if (!family) throw new Error('That family no longer exists');
  if (user.family_id === family.id) {
    // Already in (opened the link again, or signed up and then tapped it):
    // still make the profile theirs.
    try { await linkProfile(db, user, invite, family.id); } catch (e) { console.warn('[family] link failed:', (e as Error).message); }
    return family;
  }
  await db.User.update(user.id, { family_id: family.id, family_role: 'member', invite_code_used: clean });
  await db.Invite.update(invite.id, { uses_count: (invite.uses_count || 0) + 1 });
  // Their own things come along (a member who tried the app alone first).
  await backfill(db, user.id, family.id);
  try { await linkProfile(db, user, invite, family.id); } catch (e) { console.warn('[family] link failed:', (e as Error).message); }
  return family;
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const mode = String(body?.mode || 'ensure');

  // No sign-in needed: the join page shows whose family a code opens.
  if (mode === 'lookup') {
    const clean = String(body.code || '').trim().toUpperCase();
    if (!clean) return Response.json({ ok: false, error: 'Enter the invite code' }, { status: 400 });
    const invites = (await db.Invite.filter({ code: clean, is_active: true })) || [];
    const invite = invites.find((i: any) => i.family_id);
    if (!invite) return Response.json({ ok: false, error: 'Code not found or no longer active' });
    if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return Response.json({ ok: false, error: 'This invite code has expired. Ask for a new one.' });
    return Response.json({ ok: true, family_name: invite.family_name, invited_by: invite.created_by_name || '', member_name: invite.family_member_name || '' });
  }

  let me: any = null;
  try { me = await base44.auth.me(); } catch (_) { me = null; }
  if (!me?.id) return Response.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  // auth.me() answers from the token; the User row has the fields set here.
  const fresh = (await db.User.filter({ id: me.id }))?.[0];
  if (fresh) me = { ...me, ...fresh };

  try {
    if (mode === 'ensure') {
      let family: any = null;
      if (body.pending_invite) {
        try { family = await joinByCode(db, me, body.pending_invite); } catch (e) { console.warn('[family] pending invite failed:', (e as Error).message); }
      }
      if (!family && me.family_id) {
        family = (await db.Family.filter({ id: me.family_id }))?.[0] || null;
      }
      if (!family && me.invite_code_used) {
        try { family = await joinByCode(db, me, me.invite_code_used); } catch (_) { family = null; }
      }
      if (!family) family = await createFamilyFor(db, me);
      const after = (await db.User.filter({ id: me.id }))?.[0] || me;
      try { await ensureOwnProfile(db, after, family.id); } catch (e) { console.warn('[family] own profile:', (e as Error).message); }
      if (body.timezone && typeof body.timezone === 'string' && body.timezone !== after.timezone) {
        try { await db.User.update(me.id, { timezone: body.timezone }); after.timezone = body.timezone; } catch (_) { /* fine */ }
      }
      if (typeof body.app_build === 'number' && body.app_build > 0 && body.app_build !== after.app_build) {
        try { await db.User.update(me.id, { app_build: body.app_build }); after.app_build = body.app_build; } catch (_) { /* fine */ }
      }
      // Record keeping (Anna, Oct 29 2026: "good record keeping for iPhone
      // users especially, to see what's working"): where they last opened it.
      const seen: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
      if (['ios', 'android', 'web'].includes(body.platform)) seen.last_platform = body.platform;
      if (typeof body.os === 'string' && body.os) seen.last_os = body.os.slice(0, 40);
      // Someone whose account name is just their email (dancinagainyeah) shows
      // to the family by the name on their profile instead.
      if (!after.display_name) {
        const local = String(after.email || '').split('@')[0].toLowerCase();
        const nameIsEmail = !after.full_name || String(after.full_name).trim().toLowerCase() === local;
        if (nameIsEmail) {
          const mine = ((await db.FamilyMember.filter({ family_id: family.id, linked_user_id: me.id })) || [])[0];
          if (mine?.name) { seen.display_name = mine.name; after.display_name = mine.name; }
        }
      }
      try { await db.User.update(me.id, seen); } catch (_) { /* fine */ }
      return Response.json({ ok: true, family, me: publicUser(after), members: await membersOf(db, family.id), access: accessOf(family, after) });
    }

    if (mode === 'join') {
      const family = await joinByCode(db, me, body.code);
      const after = (await db.User.filter({ id: me.id }))?.[0] || me;
      return Response.json({ ok: true, family, me: publicUser(after), members: await membersOf(db, family.id), access: accessOf(family, after) });
    }

    if (!me.family_id) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });
    const family = (await db.Family.filter({ id: me.family_id }))?.[0];
    if (!family) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });

    if (mode === 'invite') {
      // An invite for one profile: check it's in this family and not already someone's.
      let member: any = null;
      if (body.member_id) {
        member = (await db.FamilyMember.filter({ id: String(body.member_id) }))?.[0] || null;
        if (!member || member.family_id !== family.id) return Response.json({ ok: false, error: 'That person is not in your family' }, { status: 400 });
        if (member.linked_user_id) return Response.json({ ok: false, error: `${member.name} already uses GenCare` }, { status: 400 });
      }
      let code = code6();
      for (let i = 0; i < 5; i++) {
        const clash = (await db.Invite.filter({ code })) || [];
        if (!clash.length) break;
        code = code6();
      }
      const invite = await db.Invite.create({
        code,
        family_id: family.id,
        family_name: family.name,
        created_by_name: me.display_name || me.full_name || '',
        created_by_user_id: me.id,
        family_member_id: member?.id || null,
        family_member_name: member?.name || null,
        expires_at: new Date(Date.now() + 7 * 86400e3).toISOString(),
        is_active: true,
        uses_count: 0,
      });
      return Response.json({ ok: true, invite });
    }

    // "This one is me": someone who joined without their profile's own invite
    // (a general family code, a name that didn't match) picks the profile the
    // family made for them. Only a profile nobody uses yet.
    if (mode === 'claim_profile') {
      const member = (await db.FamilyMember.filter({ id: String(body.member_id || '') }))?.[0] || null;
      if (!member || member.family_id !== family.id) return Response.json({ ok: false, error: 'That profile is not in your family' }, { status: 400 });
      if (member.linked_user_id && member.linked_user_id !== me.id) return Response.json({ ok: false, error: `${member.name} is already someone's profile` }, { status: 400 });
      const linked = await linkProfile(db, me, { family_member_id: member.id }, family.id);
      if (!linked) return Response.json({ ok: false, error: 'Could not make that profile yours' }, { status: 400 });
      return Response.json({ ok: true, member_id: linked, member_name: member.name });
    }

    // "None of these are me": their own profile.
    if (mode === 'make_my_profile') {
      const id = await ensureOwnProfile(db, me, family.id, true);
      return Response.json({ ok: !!id, member_id: id });
    }

    if (mode === 'members') {
      return Response.json({ ok: true, members: await membersOf(db, family.id), access: accessOf(family, me) });
    }

    if (mode === 'rename') {
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) return Response.json({ ok: false, error: 'Give the family a name' }, { status: 400 });
      await db.Family.update(family.id, { name });
      return Response.json({ ok: true, family: { ...family, name } });
    }

    if (mode === 'remove_member') {
      if (me.family_role !== 'owner' && me.role !== 'admin') return Response.json({ ok: false, error: 'Only the family owner can remove people' }, { status: 403 });
      const target = (await db.User.filter({ id: String(body.user_id || '') }))?.[0];
      if (!target || target.family_id !== family.id) return Response.json({ ok: false, error: 'Not in this family' }, { status: 400 });
      if (target.id === me.id) return Response.json({ ok: false, error: 'Use Leave family instead' }, { status: 400 });
      try { await unlinkProfiles(db, target.id, family.id); } catch (_) { /* fine */ }
      await createFamilyFor(db, target); // they get a family of their own, with nothing in it
      return Response.json({ ok: true, members: await membersOf(db, family.id) });
    }

    if (mode === 'leave') {
      try { await unlinkProfiles(db, me.id, family.id); } catch (_) { /* fine */ }
      const fresh2 = await createFamilyFor(db, { ...me, family_id: null });
      const after = (await db.User.filter({ id: me.id }))?.[0] || me;
      return Response.json({ ok: true, family: fresh2, me: publicUser(after), members: await membersOf(db, fresh2.id), access: accessOf(fresh2, after) });
    }

    return Response.json({ ok: false, error: 'Unknown mode' }, { status: 400 });
  } catch (e) {
    console.error('[family]', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message || 'Something went wrong' }, { status: 400 });
  }
});

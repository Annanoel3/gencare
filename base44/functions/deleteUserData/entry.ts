import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// deleteUserData — the two buttons on Settings -> Account Management.
//
//   { mode: "data" }     clears everything the person created, keeps the account
//   { mode: "account" }  the same, then removes them from their family, deletes
//                        their push registration at OneSignal, and deletes the
//                        account itself (Google Play and Apple both require that
//                        an in-app "delete account" really deletes the account)
//
// Returns { success, mode, deleted: { <step>: true|false } } so the app can show
// what happened; a step that fails never stops the others.

const CREATED_BY_ME = [
  'FamilyMember', 'Medication', 'Appointment', 'CareTask',
  'CareJournal', 'FamilyMessage', 'Checklist', 'ChecklistItem', 'QuickNote',
  'BabyCareLog', 'ToddlerCareLog', 'SchoolAgeLog', 'PreteenLog', 'TeenLog', 'SeniorLog',
  'NoteRecording', 'CalendarExportLink', 'Invite', 'EmailChangeRequest',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode } = await req.json();
    if (!mode || !['data', 'account'].includes(mode)) {
      return Response.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const db = base44.asServiceRole.entities;
    const deleted: Record<string, boolean> = {};
    const attempt = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); deleted[name] = true; } catch (e) { console.error('[deleteUserData]', name, (e as Error).message); deleted[name] = false; }
    };

    // 1. Everything they created, in every table.
    for (const name of CREATED_BY_ME) {
      await attempt(name, () => db[name].deleteMany({ created_by_id: user.id }));
    }

    if (mode === 'data') {
      return Response.json({ success: true, mode, deleted });
    }

    // 2. Their family: gone if they were the only member, otherwise handed to
    //    the next member so the family keeps working without them.
    const me = (await db.User.filter({ id: user.id }))?.[0] || user;
    if (me.family_id) {
      await attempt('family', async () => {
        const others = (await db.User.filter({ family_id: me.family_id })).filter((u: any) => u.id !== user.id);
        if (others.length === 0) {
          await db.RecordingUsage.deleteMany({ family_id: me.family_id }).catch(() => {});
          await db.Family.delete(me.family_id);
        } else {
          const family = (await db.Family.filter({ id: me.family_id }))?.[0];
          if (family && family.owner_user_id === user.id) {
            const heir = others[0];
            await db.Family.update(family.id, { owner_user_id: heir.id });
            await db.User.update(heir.id, { family_role: 'owner' });
          }
        }
      });
    }

    // 3. Push: OneSignal keeps a user keyed by email (external id). Remove it so
    //    no reminder can reach a deleted account.
    await attempt('push', async () => {
      const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
      const rest = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
      if (!appId || !rest || !user.email) return;
      const ext = encodeURIComponent(String(user.email).toLowerCase().trim());
      const res = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${ext}`, {
        method: 'DELETE',
        // new-style keys (os_v2_...) want "Key", legacy REST keys want "Basic"
        headers: { Authorization: `${rest.startsWith('os_v2_') ? 'Key' : 'Basic'} ${rest}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok && res.status !== 404) throw new Error(`OneSignal ${res.status}`);
    });

    // 4. The goodbye email goes out before the account is gone.
    await attempt('email', () => base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Your GenCare account has been deleted',
      body: `Hi ${user.full_name || 'there'},\n\nYour GenCare account and everything in it have been permanently deleted, as you asked. You have been signed out everywhere.\n\nIf you did not request this, reply to this email right away.\n\nGenCare`,
    }));

    // 5. The account itself. If the platform refuses, scrub what we can so the
    //    record holds nothing personal and cannot receive anything.
    await attempt('account', async () => {
      try {
        await db.User.delete(user.id);
      } catch (e) {
        console.error('[deleteUserData] User.delete refused, scrubbing instead:', (e as Error).message);
        await db.User.update(user.id, {
          display_name: 'Deleted account', family_id: null, family_role: null,
          onesignal_player_id: null, push_enabled: false, notify_reminders: false, notify_family_events: false,
          device_calendar_ids: [], export_enabled: false, export_calendar_id: null, import_share_calendar_ids: [],
        });
        throw e;
      }
    });

    return Response.json({ success: true, mode, deleted });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

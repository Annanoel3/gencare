import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// The phone's OneSignal subscription id, kept on the account for diagnostics
// (pushes themselves target the email as external id, see shared/push.ts).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const playerId = String(body?.playerId || '').trim();
    if (!playerId) return Response.json({ ok: false, error: 'playerId required' }, { status: 400 });
    await base44.asServiceRole.entities.User.update(user.id, { onesignal_player_id: playerId });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

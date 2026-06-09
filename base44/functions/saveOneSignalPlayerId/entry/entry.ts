import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { playerId } = await req.json();
    const currentUser = await base44.asServiceRole.entities.User.get(user.id);
    const existingIds = currentUser?.onesignal_player_ids || [];
    if (!existingIds.includes(playerId)) {
        await base44.asServiceRole.entities.User.update(user.id, {
            onesignal_player_ids: [...existingIds, playerId]
        });
    }
    return Response.json({ success: true, playerId });
});
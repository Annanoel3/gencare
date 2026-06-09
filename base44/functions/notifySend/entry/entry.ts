import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { toUserId, title, body, screen, data } = await req.json();
  const users = await base44.asServiceRole.entities.User.filter({ email: toUserId });
  const targetUser = users[0];
  if (!targetUser) return Response.json({ error: 'User not found' }, { status: 404 });
  const playerIds = targetUser.onesignal_player_ids || [];
  if (playerIds.length === 0) return Response.json({ error: 'No player IDs' }, { status: 400 });
  const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
  const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings: { en: title || 'GenCare' },
    contents: { en: body || 'You have a notification' },
    data: { screen: screen || '/Home', ...data },
  };
  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + ONESIGNAL_REST_API_KEY },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  return Response.json({ success: true, result });
});
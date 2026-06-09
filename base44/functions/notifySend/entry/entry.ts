import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { toUserId, title, body, screen, data } = await req.json();
  if (!toUserId) return Response.json({ error: 'toUserId is required' }, { status: 400 });
  const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
  const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: [toUserId] },
    target_channel: 'push',
    headings: { en: title || 'GenCare' },
    contents: { en: body || 'You have a notification' },
    data: { screen: screen || '/', ...data },
  };
  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + ONESIGNAL_REST_API_KEY },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  return Response.json({ success: true, result });
});
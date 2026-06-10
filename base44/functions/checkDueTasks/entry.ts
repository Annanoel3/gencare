import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both scheduled (service role) and manual admin calls
  const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
  const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Get tomorrow's date string for "approaching" tasks (due within 24h)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Fetch all pending/in_progress tasks with a due date
  // Fetch pending + in_progress tasks with a due date
  const [pendingTasks, inProgressTasks] = await Promise.all([
    base44.asServiceRole.entities.CareTask.filter({ status: 'pending' }),
    base44.asServiceRole.entities.CareTask.filter({ status: 'in_progress' }),
  ]);
  const tasks = [...pendingTasks, ...inProgressTasks];

  const overdue = tasks.filter(t => t.due_date && t.due_date < todayStr);
  const dueSoon = tasks.filter(t => t.due_date && t.due_date === tomorrowStr);

  if (overdue.length === 0 && dueSoon.length === 0) {
    return Response.json({ message: 'No due or overdue tasks', sent: 0 });
  }

  // Get all users to notify
  const users = await base44.asServiceRole.entities.User.list();

  const notifications = [];

  for (const user of users) {
    const messages = [];

    if (overdue.length > 0) {
      const names = overdue.slice(0, 3).map(t => t.title).join(', ');
      const extra = overdue.length > 3 ? ` (+${overdue.length - 3} more)` : '';
      messages.push({
        title: `⚠️ ${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}`,
        body: `${names}${extra}`,
        screen: '/tasks',
      });
    }

    if (dueSoon.length > 0) {
      const names = dueSoon.slice(0, 3).map(t => t.title).join(', ');
      const extra = dueSoon.length > 3 ? ` (+${dueSoon.length - 3} more)` : '';
      messages.push({
        title: `🔔 ${dueSoon.length} Task${dueSoon.length > 1 ? 's' : ''} Due Tomorrow`,
        body: `${names}${extra}`,
        screen: '/tasks',
      });
    }

    for (const msg of messages) {
      const payload = {
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: [user.id] },
        target_channel: 'push',
        headings: { en: msg.title },
        contents: { en: msg.body },
        data: { screen: msg.screen },
      };

      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + ONESIGNAL_REST_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      notifications.push({ userId: user.id, ...msg, result });
    }
  }

  return Response.json({ success: true, sent: notifications.length, notifications });
});
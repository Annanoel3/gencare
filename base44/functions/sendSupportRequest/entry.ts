import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// Sends a person's question, bug report or suggested resource (from the
// Resources page) to the app owner's inbox (the same
// address ADHDone's support requests go to), with the details that help
// answer it: who, which build, which page, their family's id.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'bug' ? 'Bug report' : body?.kind === 'resource' ? 'Resource suggestion' : 'Support request';
    const message = String(body?.message || '').trim().slice(0, 4000);
    if (!message) return Response.json({ error: 'Nothing to send' }, { status: 400 });
    const row = (await base44.asServiceRole.entities.User.filter({ id: user.id }))?.[0] || user;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: 'mediocreatbestdev@outlook.com',
      from_name: 'GenCare Support',
      subject: `GenCare ${kind.toLowerCase()} from ${user.full_name || user.email}`,
      body: `${kind} from GenCare.

From: ${user.full_name || 'Unknown'} (${user.email})
Family id: ${row.family_id || '(none)'}
App build: ${row.app_build || 'website'}
Page: ${String(body?.page || '').slice(0, 200)}
Time: ${new Date().toISOString()}

Their message:
"${message}"`,
    });
    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

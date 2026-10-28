import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { newEmail } = await req.json();
    if (!newEmail || !newEmail.includes('@')) {
      return Response.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (newEmail.toLowerCase() === user.email?.toLowerCase()) {
      return Response.json({ error: 'New email must be different from your current email' }, { status: 400 });
    }

    const db = base44.asServiceRole.entities;
    await db.EmailChangeRequest.create({
      current_email: user.email,
      requested_email: newEmail,
      user_id: user.id,
      status: 'pending'
    });

    // Nobody can change a login email from inside the app, so the request goes
    // to the person who can: the support mailbox gets it, the user gets a copy.
    const mail = base44.asServiceRole.integrations.Core;
    await mail.SendEmail({
      to: 'mediocreatbestdev@outlook.com',
      subject: `GenCare email change: ${user.email} -> ${newEmail}`,
      body: `${user.full_name || user.email} (user id ${user.id}) asked to change their GenCare login email.\n\nFrom: ${user.email}\nTo: ${newEmail}\n\nChange it in the Base44 dashboard (Users), then reply to both addresses so they know.`,
    });
    await mail.SendEmail({
      to: user.email,
      subject: 'Your GenCare email change request',
      body: `Hi ${user.full_name || 'there'},\n\nWe got your request to change your GenCare email to ${newEmail}. A person handles these by hand, usually within a few days, and will reply to both addresses when it's done. Until then, keep signing in with ${user.email}.\n\nIf you did not ask for this, reply to this email.\n\nGenCare`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
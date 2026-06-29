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

    await base44.entities.EmailChangeRequest.create({
      current_email: user.email,
      requested_email: newEmail,
      user_id: user.id,
      status: 'pending'
    });

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: 'Email Change Request Received',
      body: `Hi ${user.full_name || 'there'},\n\nWe received your request to change your GenCare email to ${newEmail}.\n\nOur team will review and process this request. You'll receive a confirmation at your new email once it has been approved.\n\nIf you did not make this request, please contact support immediately.\n\nGenCare Team`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
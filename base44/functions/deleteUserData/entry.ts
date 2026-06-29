import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode } = await req.json();
    if (!mode || !['data', 'account'].includes(mode)) {
      return Response.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const entityNames = [
      'FamilyMember', 'Medication', 'Appointment', 'CareTask',
      'CareJournal', 'FamilyMessage', 'Checklist', 'ChecklistItem', 'QuickNote'
    ];

    const deleted = {};
    for (const name of entityNames) {
      try {
        await base44.asServiceRole.entities[name].deleteMany({ created_by_id: user.id });
        deleted[name] = true;
      } catch (e) {
        deleted[name] = false;
      }
    }

    if (mode === 'account') {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: 'GenCare Account Deletion Confirmation',
        body: `Hi ${user.full_name || 'there'},\n\nYour GenCare account data has been permanently deleted. You have been signed out.\n\nIf you did not request this, please contact support immediately.\n\nGenCare Team`
      });
    }

    return Response.json({ success: true, mode, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
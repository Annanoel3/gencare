import React, { useState } from 'react';
import { track } from '@/lib/activity';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { withFamily, useFamily } from '@/lib/family';
import { toast } from '@/components/ui/use-toast';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import { REMINDERS_KEY, listReminders, cleanMed, adherence } from '@/lib/reminders';

/**
 * Repeating reminders, for the To-do page: the list, the last 14 days of
 * done/skipped, and the add/edit dialog (save, pause, delete with its
 * history). openReminder(null) starts a new one; openReminder(med) edits.
 */
export default function useReminderEditor(members = []) {
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const [dialog, setDialog] = useState({ open: false, med: null });
  const { data: reminders = [], isFetched } = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders });
  const since = format(new Date(Date.now() - 14 * 86400000), 'yyyy-MM-dd');
  const { data: logs = [] } = useQuery({ queryKey: ['reminderLogs', since], queryFn: () => base44.entities.MedicationLog.filter({ day: { $gte: since } }, '-day', 500) });

  const refresh = () => { queryClient.invalidateQueries({ queryKey: REMINDERS_KEY }); queryClient.invalidateQueries({ queryKey: ['reminderLogs'] }); };
  const close = () => setDialog({ open: false, med: null });

  const save = useMutation({
    mutationFn: async (form) => {
      const data = cleanMed(form, members, me);
      if (dialog.med?.id) return base44.entities.Medication.update(dialog.med.id, data);
      return base44.entities.Medication.create(withFamily(data));
    },
    onSuccess: (_r, form) => { track('action', dialog.med?.id ? 'edit:reminder' : 'add:reminder', `${form.how || form.frequency || ''} ${form.visibility === 'private' ? 'just me' : 'everyone'}`); refresh(); close(); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: async (med) => {
      const mine = (await base44.entities.MedicationLog.filter({ medication_id: med.id })) || [];
      for (const l of mine) await base44.entities.MedicationLog.delete(l.id);
      return base44.entities.Medication.delete(med.id);
    },
    onSuccess: () => { track('action', 'delete:reminder'); refresh(); close(); },
  });

  const editor = (
    <ReminderDialog
      open={dialog.open}
      onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
      med={dialog.med}
      members={members}
      onSave={(form) => save.mutate(form)}
      onDelete={(m) => remove.mutate(m)}
      saving={save.isPending || remove.isPending}
      adherence={dialog.med ? adherence(dialog.med, logs) : null}
    />
  );

  return { reminders, logs, isFetched, editor, openReminder: (med) => setDialog({ open: true, med: med || null }) };
}

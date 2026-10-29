import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { exportSoon } from '@/lib/calendarSync';
import { sharingDefaultOf } from '@/lib/events';
import { track } from '@/lib/activity';
import { toast } from '@/components/ui/use-toast';
import EventDialog from '@/components/calendar/EventDialog';

/**
 * Open an event right where you are (Anna, Oct 29 2026: tapping an event on
 * To-do opened it and then jumped to the Calendar; it should just pop up).
 * Same behavior as the Calendar page: edits save as you go, the family is
 * told once when it closes, and the phone calendar gets the change.
 * Returns { openEvent(row), editor } — render `editor` once on the page.
 */
export default function useEventEditor(members = []) {
  const qc = useQueryClient();
  const { me } = useFamily();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const session = useRef(null);
  const today = useMemo(() => new Date(), []);

  const notify = (action, id) => base44.functions.invoke('notifyFamily', { kind: 'appointment', action, appointment_id: id }).catch(() => {});
  const afterChange = () => { qc.invalidateQueries({ queryKey: ['appointments'] }); exportSoon(); };

  const openEvent = (row) => {
    if (!row?.id) return;
    const v = row.visibility || 'family';
    session.current = { id: row.id, startVisibility: v, visibility: v, changed: false };
    setEditing(row);
    setOpen(true);
    track('screen', 'event (opened in place)');
  };

  const autoSave = async (data) => {
    const id = editing?.id;
    if (!id) return;
    await base44.entities.Appointment.update(id, data);
    const s = session.current;
    if (s && s.id === id) { s.changed = true; s.visibility = data.visibility; }
    qc.invalidateQueries({ queryKey: ['appointments'] });
  };

  const close = () => {
    const s = session.current;
    session.current = null;
    setOpen(false);
    if (!s?.changed) return;
    if (!(s.startVisibility === 'private' && s.visibility === 'private')) {
      notify(s.visibility === 'private' ? 'removed' : s.startVisibility === 'private' ? 'added' : 'changed', s.id);
    }
    afterChange();
  };

  const remove = useMutation({
    mutationFn: async (appt) => {
      if (appt.visibility !== 'private') await notify('removed', appt.id);
      return base44.entities.Appointment.delete(appt.id);
    },
    onSuccess: () => { track('action', 'delete:event'); session.current = null; setOpen(false); afterChange(); },
    onError: (e) => toast({ title: 'Could not delete', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  const editor = (
    <EventDialog
      open={open}
      onClose={close}
      appt={editing}
      defaultDate={today}
      members={members}
      onSave={() => {}}
      onAutoSave={autoSave}
      onDelete={(appt) => remove.mutate(appt)}
      saving={remove.isPending}
      sharingDefault={sharingDefaultOf(me)}
    />
  );
  return { openEvent, editor };
}

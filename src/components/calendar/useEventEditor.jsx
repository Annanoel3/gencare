import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { exportSoon } from '@/lib/calendarSync';
import { sharingDefaultOf, sortNewEvent } from '@/lib/events';
import { realEvent } from '@/lib/sameEvent';
import { snapshotEvent, notifyEvent } from '@/lib/eventChanges';
import { withFamily } from '@/lib/family';
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
  const [prefill, setPrefill] = useState(null); // a copy being made ("Copy to another day")
  const session = useRef(null);
  const today = useMemo(() => new Date(), []);

  const notify = (action, id, before) => notifyEvent(action, id, before && before !== 'none' ? before : undefined);
  const afterChange = () => { qc.invalidateQueries({ queryKey: ['appointments'] }); exportSoon(); };

  const openEvent = (shown) => {
    // What the family sees of their own private event opens that event.
    const row = realEvent(shown);
    if (!row?.id) return;
    const v = row.visibility || 'family';
    session.current = { id: row.id, startVisibility: v, visibility: v, changed: false };
    setPrefill(null);
    setEditing(row);
    setOpen(true);
    track('screen', 'event (opened in place)');
  };

  const autoSave = async (data) => {
    const id = editing?.id;
    if (!id) return;
    const s = session.current;
    // How it looked before the first change, for the family's push.
    // (One read per edit, even when saves overlap.)
    if (s && s.id === id) { s.beforeP = s.beforeP || snapshotEvent(id); s.before = (await s.beforeP) || 'none'; }
    await base44.entities.Appointment.update(id, data);
    if (s && s.id === id) { s.changed = true; s.visibility = data.visibility; }
    qc.invalidateQueries({ queryKey: ['appointments'] });
  };

  const close = () => {
    const s = session.current;
    session.current = null;
    setOpen(false);
    if (!s?.changed) return;
    if (!(s.startVisibility === 'private' && s.visibility === 'private')) {
      notify(s.visibility === 'private' ? 'removed' : s.startVisibility === 'private' ? 'added' : 'changed', s.id, s.before);
    }
    afterChange();
  };

  // "Copy to another day": close this one (saving it), open a new one with its details.
  const duplicate = (data) => {
    close();
    setTimeout(() => { setEditing(null); setPrefill(data); setOpen(true); }, 200);
  };
  const create = useMutation({
    mutationFn: ({ data }) => base44.entities.Appointment.create(withFamily(data)),
    onSuccess: (made, { left }) => {
      track('action', 'add:event (copy)');
      if (made?.id && made.visibility !== 'private') notify('added', made.id);
      setOpen(false); setPrefill(null);
      afterChange();
      toast({ title: 'Copied', description: 'The new event is on the calendar.' });
      sortNewEvent(made, left, sharingDefaultOf(me)).then((r) => { if (r) afterChange(); }).catch(() => {});
    },
    onError: (e) => toast({ title: 'Could not save the event', description: e?.message || 'Try again', variant: 'destructive' }),
  });

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
      onClose={() => { if (prefill) { setOpen(false); setPrefill(null); } else close(); }}
      appt={prefill ? null : editing}
      prefill={prefill}
      onDuplicate={duplicate}
      defaultDate={today}
      members={members}
      onSave={(data, left) => create.mutate({ data, left })}
      onAutoSave={autoSave}
      onDelete={(appt) => remove.mutate(appt)}
      saving={remove.isPending || create.isPending}
      sharingDefault={sharingDefaultOf(me)}
    />
  );
  return { openEvent, editor };
}

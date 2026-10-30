import React, { useState, useEffect, useMemo, useRef } from 'react';
import { track } from '@/lib/activity';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { exportSoon, syncNow, syncOnOpen } from '@/lib/calendarSync';
import { format, addWeeks, subWeeks, addDays, subDays, isSameDay, parseISO, isValid, startOfMonth, endOfMonth, min as minDate, max as maxDate } from 'date-fns';
import { expandAppointments, rowIdOf } from '@/lib/occurrences';
import { listEvents, sharingDefaultOf, sortNewEvent, sortedLine } from '@/lib/events';
import { realEvent } from '@/lib/sameEvent';
import SharingChoiceDialog from '@/components/calendar/SharingChoice';
import { CalendarDays, Plus, Smartphone, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import MonthView from '@/components/calendar/MonthView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import EventRow from '@/components/calendar/EventRow';
import EventDialog from '@/components/calendar/EventDialog';
import PhoneCalendarSheet from '@/components/calendar/PhoneCalendarSheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getMemberColorClass, getUserColorClass, PRIVATE_COLOR, PET_COLOR, isPet } from '@/utils/memberColors';
import { useFamily } from '@/lib/family';
import { toast } from '@/components/ui/use-toast';

// The family calendar. Everyone in the family sees shared events; private
// ones only their owner. Changes tell the family (notifyFamily) and go to this
// phone's calendar right away (exportSoon); other phones get them with the
// app closed (CalendarSyncWorker) or on their next open.
export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('gencare_calendar_view') || 'month'; } catch { return 'month'; }
  });
  const initialDate = useMemo(() => {
    const d = params.get('date');
    const parsed = d ? parseISO(d) : null;
    return parsed && isValid(parsed) ? parsed : new Date();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [currentMonth, setCurrentMonth] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefill, setPrefill] = useState(null); // "Copy to another day"
  const [phoneOpen, setPhoneOpen] = useState(false);
  const queryClient = useQueryClient();
  const { me, members: accounts, refresh: refreshFamily } = useFamily();

  useEffect(() => {
    try { localStorage.setItem('gencare_calendar_view', view); } catch {}
  }, [view]);

  // The days in view (the month, a week either side, and the picked day's
  // week), loaded by date so a year of phone events can't crowd them out.
  const range = useMemo(() => ({
    from: minDate([addDays(startOfMonth(currentMonth), -7), addDays(selectedDate, -7)]),
    to: maxDate([addDays(endOfMonth(currentMonth), 7), addDays(selectedDate, 7)]),
  }), [currentMonth, selectedDate]);
  const fromKey = format(range.from, 'yyyy-MM-dd');
  const toKey = format(range.to, 'yyyy-MM-dd');
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', 'calendar', fromKey, toKey],
    queryFn: () => listEvents(range.from, range.to),
    placeholderData: keepPreviousData,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  // A push tap (or an event tapped on Tasks) lands on that event.
  useEffect(() => {
    const open = params.get('open');
    if (!open) return;
    const clear = () => {
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    };
    const found = appointments.find((a) => a.id === open);
    if (found) { setEditing(realEvent(found)); setDialogOpen(true); clear(); return; }
    // Not in the days loaded (or not loaded yet): fetch that one event.
    let cancelled = false;
    base44.entities.Appointment.filter({ id: open }).then((rows) => {
      if (cancelled) return;
      const row = rows?.[0];
      if (row) { setEditing(row); setDialogOpen(true); }
      clear();
    }).catch(() => { if (!cancelled) clear(); });
    return () => { cancelled = true; };
  }, [params.get('open')]); // eslint-disable-line react-hooks/exhaustive-deps

  // The + button's "Event" lands here with ?new=1.
  useEffect(() => {
    if (!params.get('new')) return;
    setPrefill(null); setEditing(null); setDialogOpen(true);
    const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true });
  }, [params.get('new')]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    exportSoon();
  };
  const notify = (action, id) => base44.functions.invoke('notifyFamily', { kind: 'appointment', action, appointment_id: id }).catch(() => {});
  const sharingDefault = sharingDefaultOf(me);

  const createMutation = useMutation({
    mutationFn: ({ data }) => base44.entities.Appointment.create(withFamily(data)),
    onSuccess: (created, { left }) => {
      track('action', 'add:event');
      if (created?.id && created.visibility !== 'private') notify('added', created.id);
      afterChange();
      setDialogOpen(false);
      setEditing(null);
      setPrefill(null);
      // GenCare fills in what was left to it (who it's for, category, and
      // with "GenCare decides", sharing) a moment later.
      sortNewEvent(created, left, sharingDefault).then((r) => {
        if (!r) {
          if (left?.visibility && sharingDefault === 'auto') toast({ title: 'Added', description: 'Kept just for you for now. Tap the event to share it.' });
          return;
        }
        if (r.becameShared) notify('added', created.id);
        afterChange();
        const line = sortedLine(r);
        if (line) toast({ title: 'Added', description: line });
      }).catch(() => {});
    },
    onError: (e) => toast({ title: 'Could not save the event', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  // Editing saves as you go; the family is told once, when the event closes.
  const editSession = useRef(null);
  useEffect(() => {
    if (dialogOpen && editing?.id && editSession.current?.id !== editing.id) {
      const v = editing.visibility || 'family';
      editSession.current = { id: editing.id, startVisibility: v, visibility: v, changed: false };
    }
  }, [dialogOpen, editing]);
  const autoSave = async (data) => {
    const id = editing?.id;
    if (!id) return;
    await base44.entities.Appointment.update(id, data);
    const s = editSession.current;
    if (s && s.id === id) { s.changed = true; s.visibility = data.visibility; }
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };
  const closeDialog = () => {
    const s = editSession.current;
    editSession.current = null;
    setDialogOpen(false);
    setEditing(null);
    if (!s?.changed) return;
    if (!(s.startVisibility === 'private' && s.visibility === 'private')) {
      notify(s.visibility === 'private' ? 'removed' : s.startVisibility === 'private' ? 'added' : 'changed', s.id);
    }
    afterChange();
  };

  const deleteMutation = useMutation({
    mutationFn: async (appt) => {
      // Tell the family before the row is gone (the push text comes from it).
      if (appt.visibility !== 'private') {
        await base44.functions.invoke('notifyFamily', { kind: 'appointment', action: 'removed', appointment_id: appt.id }).catch(() => {});
      }
      return base44.entities.Appointment.delete(appt.id);
    },
    onSuccess: () => { track('action', 'delete:event'); editSession.current = null; afterChange(); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast({ title: 'Could not delete', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  const saving = createMutation.isPending || deleteMutation.isPending;

  // "Who sees the events you add?", asked the first time (closed without an
  // answer: asked again next visit). Never on top of another popup.
  const [askClosed, setAskClosed] = useState(false);

  // The app owner's "Sort again": GenCare re-sorts their events from a week
  // ago through the next 60 days (who each is about, sharing, category),
  // still leaving alone anything picked by hand.
  const [resorting, setResorting] = useState(false);
  const resort = async () => {
    setResorting(true);
    try {
      const res = await base44.functions.invoke('phoneCalendar', { mode: 'resort' });
      const r = res?.data || res;
      if (!r?.ok) throw new Error(r?.error || 'Try again');
      toast({ title: 'Sorted again', description: `${r.looked_at} events checked, ${r.sorted} updated.` });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      exportSoon();
    } catch (e) {
      toast({ title: 'Could not sort', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setResorting(false); }
  };
  const askSharing = !!me?.id && !sharingDefault && !askClosed && !dialogOpen && !phoneOpen && !params.get('open');

  // Repeating and multi-day events, one entry per day, for the days in view.
  const occurrences = useMemo(() => expandAppointments(appointments, range.from, range.to), [appointments, range]);

  const selectedDayAppointments = occurrences
    .filter(a => a.date && isSameDay(parseISO(a.date), selectedDate))
    .sort((a, b) => (a.all_day ? '' : a.time || '').localeCompare(b.all_day ? '' : b.time || ''));

  const openNew = () => { setPrefill(null); setEditing(null); setDialogOpen(true); };
  const duplicate = (data) => { closeDialog(); setTimeout(() => { setPrefill(data); setEditing(null); setDialogOpen(true); }, 200); };
  // An occurrence of a series opens the series itself.
  const openEdit = (occ) => { setEditing(realEvent(appointments.find((a) => a.id === rowIdOf(occ)) || occ)); setDialogOpen(true); };

  const onSave = (data, left) => { if (!editing?.id) createMutation.mutate({ data, left }); };

  // Sync: on its own when the page opens (if it's been a few minutes), and now with the button.
  const [syncing, setSyncing] = useState(false);
  useEffect(() => { if (me) syncOnOpen(me).catch(() => {}); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = async () => {
    setSyncing(true);
    try {
      await syncNow(me);
      toast({ title: 'Calendar is up to date' });
    } catch (e) {
      toast({ title: e?.code === 'calendar_permission' ? 'GenCare needs calendar access to sync' : "Couldn't sync right now", description: e?.code === 'calendar_permission' ? 'Turn it back on under Phone calendar.' : e?.message, variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">The whole family's appointments and events, in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {me?.role === 'admin' && (
            <Button variant="outline" onClick={resort} disabled={resorting} className="rounded-xl gap-2" title="Only your account sees this">
              {resorting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Sort again
            </Button>
          )}
          <Button variant="outline" onClick={() => setPhoneOpen(true)} className="rounded-xl gap-2"><Smartphone className="w-4 h-4" /> Phone calendar</Button>
          <Button variant="outline" onClick={sync} disabled={syncing} className="rounded-xl gap-2" aria-label="Sync with your phone calendar"><RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sync</Button>
          <Button onClick={openNew} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Event</Button>
        </div>
      </div>

      {/* What the colors mean: whose event it is (about them, or from their
          calendar when it's about nobody the app knows); gray is only you. */}
      <div className="flex flex-wrap gap-3 mb-4 px-1">
        {members.filter((m) => !isPet(m)).map(m => (
          <div key={m.id} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(m, members)}`} />
            <span className="text-xs text-muted-foreground">{m.name}</span>
          </div>
        ))}
        {(accounts || []).filter((u) => !members.some((m) => m.linked_user_id === u.id)).map((u) => (
          <div key={u.id} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${getUserColorClass(u.id, members, accounts)}`} />
            <span className="text-xs text-muted-foreground">{(u.full_name || u.email || '?').split(' ')[0]}</span>
          </div>
        ))}
        {members.some(isPet) && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${PET_COLOR}`} />
            <span className="text-xs text-muted-foreground">Pets</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${PRIVATE_COLOR}`} />
          <span className="text-xs text-muted-foreground">Only you</span>
        </div>
        {/* Anna, Oct 30 2026: say what plain text means, and how to fix it. */}
        <p className="basis-full text-xs text-muted-foreground">
          Events in plain text, with no color, aren't care-related. If GenCare got one wrong, tap it and turn on Care-related.
        </p>
      </div>

      <Tabs value={view} onValueChange={setView} className="mb-6">
        <TabsList className="bg-muted rounded-xl mb-4">
          <TabsTrigger value="month" className="rounded-lg">Month</TabsTrigger>
          <TabsTrigger value="week" className="rounded-lg">Week</TabsTrigger>
          <TabsTrigger value="day" className="rounded-lg">Day</TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          <MonthView
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            appointments={occurrences}
            members={members}
          />
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h3>
              <Button variant="outline" size="sm" onClick={openNew} className="rounded-lg gap-1"><Plus className="w-3 h-3" /> Add</Button>
            </div>
            {selectedDayAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Nothing on this day.</p>
            ) : (
              <div className="space-y-3">
                {selectedDayAppointments.map(appt => (
                  <EventRow key={appt.id} appt={appt} members={members} onClick={openEdit} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="week">
          <WeekView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onPrev={() => setSelectedDate(subWeeks(selectedDate, 1))}
            onNext={() => setSelectedDate(addWeeks(selectedDate, 1))}
            appointments={occurrences}
            members={members}
            onOpen={openEdit}
          />
        </TabsContent>

        <TabsContent value="day">
          <DayView
            selectedDate={selectedDate}
            onPrev={() => setSelectedDate(subDays(selectedDate, 1))}
            onNext={() => setSelectedDate(addDays(selectedDate, 1))}
            onAdd={openNew}
            appointments={occurrences}
            members={members}
            onOpen={openEdit}
          />
        </TabsContent>
      </Tabs>

      <EventDialog
        open={dialogOpen}
        onClose={() => { setPrefill(null); closeDialog(); }}
        appt={editing}
        prefill={prefill}
        onDuplicate={duplicate}
        defaultDate={selectedDate}
        members={members}
        onSave={onSave}
        onAutoSave={autoSave}
        onDelete={(appt) => deleteMutation.mutate(appt)}
        saving={saving}
        sharingDefault={sharingDefault}
      />
      <PhoneCalendarSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} members={members} />
      <SharingChoiceDialog open={askSharing} onClose={() => setAskClosed(true)} onSaved={() => { setAskClosed(true); refreshFamily?.(); }} />
    </div>
  );
}

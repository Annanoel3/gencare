import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';
import { exportSoon } from '@/lib/calendarSync';
import { format, addWeeks, subWeeks, addDays, subDays, isSameDay, parseISO, isValid, startOfMonth, endOfMonth, min as minDate, max as maxDate } from 'date-fns';
import { expandAppointments, rowIdOf } from '@/lib/occurrences';
import { listEvents } from '@/lib/events';
import { CalendarDays, Plus, Smartphone } from 'lucide-react';
import MonthView from '@/components/calendar/MonthView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import EventRow from '@/components/calendar/EventRow';
import EventDialog from '@/components/calendar/EventDialog';
import PhoneCalendarSheet from '@/components/calendar/PhoneCalendarSheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getMemberColorClass } from '@/utils/memberColors';
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
  const [phoneOpen, setPhoneOpen] = useState(false);
  const queryClient = useQueryClient();

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
    if (found) { setEditing(found); setDialogOpen(true); clear(); return; }
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

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    exportSoon();
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Appointment.create(withFamily(data)),
    onSuccess: (created) => {
      if (created?.id && created.visibility !== 'private') {
        base44.functions.invoke('notifyFamily', { kind: 'appointment', action: 'added', appointment_id: created.id }).catch(() => {});
      }
      afterChange();
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e) => toast({ title: 'Could not save the event', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Appointment.update(id, data),
    onSuccess: (_r, { id, data, wasPrivate }) => {
      if (data.visibility !== 'private' || !wasPrivate) {
        base44.functions.invoke('notifyFamily', { kind: 'appointment', action: data.visibility === 'private' ? 'removed' : 'changed', appointment_id: id }).catch(() => {});
      }
      afterChange();
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e) => toast({ title: 'Could not save the change', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (appt) => {
      // Tell the family before the row is gone (the push text comes from it).
      if (appt.visibility !== 'private') {
        await base44.functions.invoke('notifyFamily', { kind: 'appointment', action: 'removed', appointment_id: appt.id }).catch(() => {});
      }
      return base44.entities.Appointment.delete(appt.id);
    },
    onSuccess: () => { afterChange(); setDialogOpen(false); setEditing(null); },
    onError: (e) => toast({ title: 'Could not delete', description: e?.message || 'Try again', variant: 'destructive' }),
  });

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // Repeating and multi-day events, one entry per day, for the days in view.
  const occurrences = useMemo(() => expandAppointments(appointments, range.from, range.to), [appointments, range]);

  const selectedDayAppointments = occurrences
    .filter(a => a.date && isSameDay(parseISO(a.date), selectedDate))
    .sort((a, b) => (a.all_day ? '' : a.time || '').localeCompare(b.all_day ? '' : b.time || ''));

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  // An occurrence of a series opens the series itself.
  const openEdit = (occ) => { setEditing(appointments.find((a) => a.id === rowIdOf(occ)) || occ); setDialogOpen(true); };

  const onSave = (data) => {
    if (editing?.id) updateMutation.mutate({ id: editing.id, data, wasPrivate: editing.visibility === 'private' });
    else createMutation.mutate(data);
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
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => setPhoneOpen(true)} className="rounded-xl gap-2"><Smartphone className="w-4 h-4" /> Phone calendar</Button>
          <Button onClick={openNew} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Event</Button>
        </div>
      </div>

      {members.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 px-1">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(m, members)}`} />
              <span className="text-xs text-muted-foreground">{m.name}</span>
            </div>
          ))}
        </div>
      )}

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
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        appt={editing}
        defaultDate={selectedDate}
        members={members}
        onSave={onSave}
        onDelete={(appt) => deleteMutation.mutate(appt)}
        saving={saving}
      />
      <PhoneCalendarSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} members={members} />
    </div>
  );
}

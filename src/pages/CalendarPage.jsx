import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, isSameDay, parseISO } from 'date-fns';
import { CalendarDays, Plus } from 'lucide-react';
import GoogleCalendarSync from '@/components/calendar/GoogleCalendarSync';
import MonthView from '@/components/calendar/MonthView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import EventRow from '@/components/calendar/EventRow';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getMemberColorClass } from '@/utils/memberColors';

export default function CalendarPage() {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('gencare_calendar_view') || 'month'; } catch { return 'month'; }
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    try { localStorage.setItem('gencare_calendar_view', view); } catch {}
  }, [view]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', category: 'Doctor', location: '', notes: '', family_member_id: '' });
  const queryClient = useQueryClient();

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 200),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      return base44.entities.Appointment.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setDialogOpen(false);
    },
  });

  const selectedDayAppointments = appointments
    .filter(a => a.date && isSameDay(parseISO(a.date), selectedDate))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const openNewAppt = () => {
    setForm({ ...form, date: format(selectedDate, 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">All family appointments and events in one place.</p>
        </div>
        <Button onClick={openNewAppt} className="rounded-xl gap-2 flex-shrink-0"><Plus className="w-4 h-4" /> Add Event</Button>
      </div>

      <GoogleCalendarSync />

      {/* Color legend */}
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
            appointments={appointments}
            members={members}
          />
          {/* Selected Day */}
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h3>
              <Button variant="outline" size="sm" onClick={openNewAppt} className="rounded-lg gap-1"><Plus className="w-3 h-3" /> Add</Button>
            </div>
            {selectedDayAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No events scheduled.</p>
            ) : (
              <div className="space-y-3">
                {selectedDayAppointments.map(appt => (
                  <EventRow key={appt.id} appt={appt} members={members} />
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
            appointments={appointments}
            members={members}
          />
        </TabsContent>

        <TabsContent value="day">
          <DayView
            selectedDate={selectedDate}
            onPrev={() => setSelectedDate(subDays(selectedDate, 1))}
            onNext={() => setSelectedDate(addDays(selectedDate, 1))}
            onAdd={openNewAppt}
            appointments={appointments}
            members={members}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl">New Event</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="mt-1" /></div>
              <div><Label>Time</Label><Input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Doctor', 'Therapy', 'School', 'Sports', 'Social', 'Other'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Family Member</Label>
                <Select value={form.family_member_id} onValueChange={v => setForm({...form, family_member_id: v})}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="mt-1" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="mt-1" /></div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.title || !form.date || createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Event'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
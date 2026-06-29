import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, parseISO, isToday } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import GoogleCalendarSync from '@/components/calendar/GoogleCalendarSync';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  Doctor: 'bg-blue-500', Therapy: 'bg-purple-500', School: 'bg-amber-500',
  Sports: 'bg-emerald-500', Social: 'bg-pink-500', Other: 'bg-gray-500',
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
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
    queryFn: () => base44.entities.FamilyMember.list(),
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

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();

  const selectedDayAppointments = appointments.filter(a => a.date && isSameDay(parseISO(a.date), selectedDate));

  const openNewAppt = () => {
    setForm({ ...form, date: format(selectedDate, 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">All family appointments and events in one place.</p>
        </div>
        <Button onClick={openNewAppt} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Event</Button>
      </div>

      <GoogleCalendarSync />

      {/* Calendar Grid */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-5 h-5" /></Button>
          <h2 className="font-heading text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-5 h-5" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array(startDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
          {days.map(day => {
            const dayAppts = appointments.filter(a => a.date && isSameDay(parseISO(a.date), day));
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all ${
                  selected ? 'bg-primary text-primary-foreground shadow-md' :
                  today ? 'bg-primary/10 text-primary font-semibold' :
                  'hover:bg-muted'
                }`}
              >
                {format(day, 'd')}
                {dayAppts.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayAppts.slice(0, 3).map((a, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-primary-foreground' : categoryColors[a.category] || 'bg-gray-400'}`} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h3>
          <Button variant="outline" size="sm" onClick={openNewAppt} className="rounded-lg gap-1"><Plus className="w-3 h-3" /> Add</Button>
        </div>
        {selectedDayAppointments.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No events scheduled.</p>
        ) : (
          <div className="space-y-3">
            {selectedDayAppointments.map(appt => (
              <div key={appt.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                <div className={`w-2 h-full min-h-[40px] rounded-full ${categoryColors[appt.category] || 'bg-gray-400'}`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{appt.title}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {appt.time && <span className="text-xs text-muted-foreground">{appt.time}</span>}
                    {appt.family_member_name && <Badge variant="secondary" className="text-xs">{appt.family_member_name}</Badge>}
                    {appt.location && <span className="text-xs text-muted-foreground">📍 {appt.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
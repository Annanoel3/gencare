import React from 'react';
import { format, isSameDay, isToday, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EventRow from './EventRow';
import PinchZoom from '@/components/shared/PinchZoom';

export default function DayView({ selectedDate, onPrev, onNext, onAdd, appointments, members, onOpen, isFocus = () => false }) {
  const dayAppts = appointments
    .filter(a => a.date && isSameDay(parseISO(a.date), selectedDate))
    .sort((a, b) => (a.all_day ? '' : a.time || '').localeCompare(b.all_day ? '' : b.time || ''));
  const today = isToday(selectedDate);

  return (
    <div className="bg-card -mx-4 border-y border-border/50 px-3 py-4 md:mx-0 md:rounded-2xl md:border md:p-6">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="icon" onClick={onPrev}><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          {today && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Today</span>}
        </h2>
        <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="w-5 h-5" /></Button>
      </div>
      {dayAppts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm mb-4">No events scheduled for this day.</p>
          <Button variant="outline" size="sm" onClick={onAdd} className="rounded-lg gap-1"><Plus className="w-3 h-3" /> Add Event</Button>
        </div>
      ) : (
        <PinchZoom storageKey="gencare_cal_zoom_day">
          <div className="space-y-3">
            {dayAppts.map(appt => <EventRow key={appt.id} appt={appt} members={members} onClick={onOpen} focus={isFocus(appt)} />)}
          </div>
        </PinchZoom>
      )}
    </div>
  );
}
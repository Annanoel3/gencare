import React from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EventRow from './EventRow';

export default function WeekView({ selectedDate, setSelectedDate, onPrev, onNext, appointments, members }) {
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="icon" onClick={onPrev}><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="font-heading text-lg font-semibold">{format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}</h2>
        <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="w-5 h-5" /></Button>
      </div>
      <div className="space-y-4">
        {days.map(day => {
          const dayAppts = appointments
            .filter(a => a.date && isSameDay(parseISO(a.date), day))
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="flex gap-3">
              <button
                onClick={() => setSelectedDate(day)}
                className="flex flex-col items-center justify-center w-14 flex-shrink-0"
              >
                <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                <span className={`text-lg font-semibold rounded-full w-9 h-9 flex items-center justify-center transition-colors ${
                  selected ? 'bg-primary text-primary-foreground' :
                  today ? 'text-primary' : 'text-foreground'
                }`}>{format(day, 'd')}</span>
              </button>
              <div className="flex-1 min-w-0 space-y-2">
                {dayAppts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No events</p>
                ) : (
                  dayAppts.map(appt => <EventRow key={appt.id} appt={appt} members={members} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
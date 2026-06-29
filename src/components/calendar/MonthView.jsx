import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMemberColorByMemberId } from '@/utils/memberColors';

export default function MonthView({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, appointments, members }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
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
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-primary-foreground' : getMemberColorByMemberId(a.family_member_id, members)}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
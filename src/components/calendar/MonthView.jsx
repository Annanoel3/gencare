import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMemberColorByMemberId } from '@/utils/memberColors';

// Month grid with WORDS in the cells (the event titles), not dots — the same
// call Anna made for ADHDone (Oct 27, 2026): a phone calendar widget fits
// words and is easier to read. Two titles a day, then "+N".
export default function MonthView({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, appointments, members }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-2 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-6">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="font-heading text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-5 h-5" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-px mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {Array(startDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(day => {
          const dayAppts = appointments
            .filter(a => a.date && isSameDay(parseISO(a.date), day))
            .sort((a, b) => (a.all_day ? '' : a.time || '').localeCompare(b.all_day ? '' : b.time || ''));
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          const shown = dayAppts.slice(0, 2);
          const extra = dayAppts.length - shown.length;
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={`min-h-[64px] md:min-h-[88px] rounded-lg flex flex-col items-stretch p-0.5 md:p-1 text-left transition-all overflow-hidden ${
                selected ? 'bg-primary/15 ring-2 ring-primary' :
                today ? 'bg-primary/5' :
                'hover:bg-muted'
              }`}
            >
              <span className={`text-[11px] md:text-xs leading-4 px-0.5 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{format(day, 'd')}</span>
              <div className="flex flex-col gap-px mt-0.5">
                {shown.map(a => (
                  <span
                    key={a.id}
                    className={`block truncate rounded px-1 text-[10px] md:text-[11px] leading-4 text-white ${getMemberColorByMemberId(a.family_member_id, members)}`}
                    title={a.title}
                  >
                    {a.title}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] leading-4 px-1 text-muted-foreground">+{extra} more</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

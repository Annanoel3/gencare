import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventHighlightClass, PRIVATE_COLOR } from '@/utils/memberColors';
import { shownTitle } from '@/lib/eventTitle';
import { eventTiming, useNow } from '@/lib/eventTiming';
import { checkOn } from '@/lib/claims';
import { useFamily } from '@/lib/family';
import PinchZoom from '@/components/shared/PinchZoom';

// Month grid with WORDS in the cells (the event titles), not dots — the same
// call Anna made for ADHDone (Oct 27, 2026): a phone calendar widget fits
// words and is easier to read. Two titles a day, then "+N".
// On a phone it runs edge to edge with bigger type, and a title wraps onto a
// second line instead of being cut off (Anna, Nov 10 2026: "everything is way
// too tiny. Especially for old people").
export default function MonthView({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, appointments, members }) {
  const { members: accounts } = useFamily();
  // Over or checked off: the chip fades (lib/eventTiming).
  const now = useNow();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();

  return (
    <div className="bg-card -mx-4 border-y border-border/50 px-0.5 py-2 md:mx-0 md:rounded-2xl md:border md:p-6">
      <div className="flex items-center justify-between mb-2 px-1 md:mb-6 md:px-0">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="font-heading text-xl font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-5 h-5" /></Button>
      </div>
      <PinchZoom storageKey="gencare_cal_zoom_month" mode="pan">
      <div className="grid grid-cols-7 gap-px mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[13px] md:text-xs font-medium text-muted-foreground py-1">{d}</div>
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
              className={`min-h-[92px] md:min-h-[88px] rounded-md md:rounded-lg flex flex-col items-stretch px-px py-0.5 md:p-1 text-left transition-all overflow-hidden ${
                selected ? 'bg-primary/15 ring-2 ring-primary' :
                today ? 'bg-primary/5' :
                'hover:bg-muted'
              }`}
            >
              <span className={`self-start text-[15px] md:text-xs leading-6 md:leading-4 font-semibold md:font-normal min-w-6 text-center md:min-w-0 md:text-left px-0.5 rounded-full ${today ? 'bg-primary text-primary-foreground md:bg-transparent md:text-primary md:font-bold' : 'text-foreground/80 md:text-muted-foreground'}`}>{format(day, 'd')}</span>
              <div className="flex flex-col gap-0.5 md:gap-px mt-0.5">
                {shown.map(a => {
                  // Care events are colored chips; the rest are plain text.
                  const color = getEventHighlightClass(a, members, accounts);
                  // A chip in the person's color doesn't need their name in
                  // it ("Mom's Speech Therapy" -> "Speech Therapy"); a plain
                  // or gray one keeps it, since nothing else says whose it is.
                  const label = shownTitle(a, members, !!color && color !== PRIVATE_COLOR);
                  return (
                    <span
                      key={a.id}
                      className={`rounded px-[2px] md:px-1 text-[12px] leading-[15px] font-medium line-clamp-2 break-words hyphens-auto md:font-normal md:text-[11px] md:leading-4 md:line-clamp-1 md:hyphens-none ${color ? `text-white ${color}` : 'text-foreground'} ${checkOn(a, a.date) || eventTiming(a, now) === 'past' ? 'opacity-50' : ''}`}
                      title={a.title}
                    >
                      {label}
                    </span>
                  );
                })}
                {extra > 0 && <span className="text-[12px] md:text-[10px] font-medium leading-4 px-[3px] md:px-1 text-muted-foreground">+{extra} more</span>}
              </div>
            </button>
          );
        })}
      </div>
      </PinchZoom>
    </div>
  );
}

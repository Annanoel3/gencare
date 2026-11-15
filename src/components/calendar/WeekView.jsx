import React from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PinchZoom from '@/components/shared/PinchZoom';
import { getEventHighlightClass, PRIVATE_COLOR } from '@/utils/memberColors';
import { shownTitle } from '@/lib/eventTitle';
import { eventTiming, useNow } from '@/lib/eventTiming';
import { checkOn } from '@/lib/claims';
import { useFamily } from '@/lib/family';
import { time12 } from '@/lib/tasks';

// The week at a glance (Anna, Nov 14 2026: "Can week be more of 'at a glance'
// than fully spelled out"): each day on its own row with a thin line between,
// and each event one line, its time and title, with a bar in its color when
// it's care-related (the same colors as the month). Tap one for everything
// else (where, notes, who's on it). Done or over: faded, like the month.
export default function WeekView({ selectedDate, setSelectedDate, onPrev, onNext, appointments, members, onOpen, isFocus = () => false }) {
  const { members: accounts } = useFamily();
  const now = useNow();
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="bg-card -mx-4 border-y border-border/50 px-3 py-4 md:mx-0 md:rounded-2xl md:border md:p-6">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Last week"><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="font-heading text-lg font-semibold">{format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}</h2>
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next week"><ChevronRight className="w-5 h-5" /></Button>
      </div>
      <PinchZoom storageKey="gencare_cal_zoom_week">
      <div className="divide-y divide-border/70">
        {days.map(day => {
          const dayAppts = appointments
            .filter(a => a.date && isSameDay(parseISO(a.date), day))
            .sort((a, b) => (a.all_day ? '' : a.time || '').localeCompare(b.all_day ? '' : b.time || ''));
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="flex gap-2 py-2">
              <button
                type="button"
                onClick={() => setSelectedDate(day)}
                aria-label={format(day, 'EEEE, MMMM d')}
                className="flex flex-col items-center w-11 flex-shrink-0 pt-0.5"
              >
                <span className={`text-xs ${today ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{format(day, 'EEE')}</span>
                <span className={`text-base font-semibold rounded-full w-8 h-8 flex items-center justify-center transition-colors ${
                  selected ? 'bg-primary text-primary-foreground' :
                  today ? 'text-primary' : 'text-foreground'
                }`}>{format(day, 'd')}</span>
              </button>
              <div className="flex-1 min-w-0">
                {dayAppts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1.5">Nothing</p>
                ) : (
                  <ul className="space-y-0.5">
                    {dayAppts.map(appt => {
                      const color = getEventHighlightClass(appt, members, accounts);
                      // A bar in the person's color doesn't need their name in the title; a plain one keeps it.
                      const label = shownTitle(appt, members, !!color && color !== PRIVATE_COLOR);
                      const faded = !!checkOn(appt, appt.date) || eventTiming(appt, now) === 'past';
                      const done = !!checkOn(appt, appt.date);
                      return (
                        <li key={appt.id}>
                          <button
                            type="button"
                            onClick={() => onOpen?.(appt)}
                            data-focus={isFocus(appt) ? 'true' : undefined}
                            className={`w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted active:bg-muted transition-shadow duration-500 ${faded ? 'opacity-55' : ''} ${isFocus(appt) ? 'ring-2 ring-primary' : ''}`}
                          >
                            <span className={`w-1 self-stretch min-h-[1.25rem] rounded-full flex-shrink-0 ${color || 'bg-transparent'}`} />
                            <span className="w-[4.25rem] flex-shrink-0 text-sm text-muted-foreground tabular-nums">
                              {appt.all_day || !appt.time ? 'All day' : time12(appt.time)}
                            </span>
                            <span className={`flex-1 min-w-0 title-fit text-[0.95rem] font-medium ${done ? 'line-through' : ''}`}>{label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </PinchZoom>
      <p className="text-xs text-muted-foreground mt-2 px-1">Tap an event for where, notes and who's on it.</p>
    </div>
  );
}

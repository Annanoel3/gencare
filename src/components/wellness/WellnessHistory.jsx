import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isAfter, isSameMonth, isToday, startOfDay, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { MOOD_SCORE, STRESS_COLORS, moodOf, isHard } from '@/lib/wellness';

/**
 * A month of check-ins, one tappable square per day (its mood, a stress bar
 * underneath), arrows to go back through earlier months, the month's mood as
 * a row of bars, and a few numbers. Tapping a day hands it to onPick.
 */
export default function WellnessHistory({ userId, onPick, footer }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const thisMonth = isSameMonth(month, new Date());
  const from = format(month, 'yyyy-MM-dd');
  const to = format(endOfMonth(month), 'yyyy-MM-dd');

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['wellnessCheckins', userId, 'month', from],
    queryFn: () => base44.entities.WellnessCheckin.filter({ user_id: userId, day: { $gte: from, $lte: to } }, 'day', 40),
    enabled: !!userId,
    placeholderData: (prev) => prev,
  });
  const byDay = useMemo(() => new Map(rows.filter((r) => r.day >= from && r.day <= to).map((r) => [r.day, r])), [rows, from, to]);
  const days = useMemo(() => eachDayOfInterval({ start: month, end: endOfMonth(month) }), [month]);
  const lead = getDay(month);
  const today = startOfDay(new Date());

  const list = [...byDay.values()];
  const hard = list.filter(isHard).length;
  const sleeps = list.filter((c) => typeof c.sleep_hours === 'number');
  const avgSleep = sleeps.length ? sleeps.reduce((a, c) => a + c.sleep_hours, 0) / sleeps.length : 0;
  const moods = list.filter((c) => MOOD_SCORE[c.mood]);
  const avgMood = moods.length ? moods.reduce((a, c) => a + MOOD_SCORE[c.mood], 0) / moods.length : 0;
  const moodWord = avgMood >= 4.5 ? 'great' : avgMood >= 3.5 ? 'mostly good' : avgMood >= 2.5 ? 'mixed' : avgMood > 0 ? 'hard' : '';

  return (
    <Card className="mb-6 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted" aria-label="Earlier month"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className={`font-heading text-lg font-semibold ${isFetching ? 'opacity-60' : ''}`}>{format(month, 'MMMM yyyy')}</h2>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={thisMonth} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-30" aria-label="Later month"><ChevronRight className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="text-[11px] font-medium text-muted-foreground pb-1">{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const c = byDay.get(key) || null;
            const m = moodOf(c);
            const future = isAfter(d, today);
            return (
              <button key={key} type="button" disabled={future} onClick={() => onPick?.({ day: key, c })}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1 ${isToday(d) ? 'ring-2 ring-primary/50' : ''} ${future ? 'opacity-30' : 'active:bg-muted'}`}
                aria-label={`${format(d, 'EEEE, MMMM d')}${c ? `: ${m?.label || 'note'}` : ', no check-in'}`}>
                <span className={`h-8 w-8 rounded-md flex items-center justify-center text-lg ${c ? '' : 'bg-muted/60'}`}>{m?.emoji || (c ? '📝' : '')}</span>
                <span className={`h-1 w-6 rounded-full ${c?.stress ? STRESS_COLORS[c.stress - 1] : 'bg-transparent'}`} />
                <span className="text-[10px] text-muted-foreground leading-none">{format(d, 'd')}</span>
              </button>
            );
          })}
        </div>

        {moods.length > 1 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Mood this month</p>
            <div className="flex items-end gap-px h-12" aria-hidden>
              {days.map((d) => {
                const c = byDay.get(format(d, 'yyyy-MM-dd'));
                const s = MOOD_SCORE[c?.mood] || 0;
                return <span key={d.toISOString()} className={`flex-1 rounded-sm ${s ? moodOf(c).bar : 'bg-muted/50'}`} style={{ height: s ? `${s * 20}%` : '6%' }} />;
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{format(month, 'MMM d')}</span><span>Taller is a better day</span><span>{format(endOfMonth(month), 'MMM d')}</span></div>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
          <span>Check-ins: <b className="text-foreground">{list.length}</b></span>
          {moodWord && <span>Overall: <b className="text-foreground">{moodWord}</b></span>}
          {list.length > 0 && <span>Hard days: <b className="text-foreground">{hard}</b></span>}
          {avgSleep > 0 && <span>Avg sleep: <b className="text-foreground">{avgSleep.toFixed(1)} h</b></span>}
          {footer}
          <span className="w-full">Tap a day to see everything you wrote. The bar under each day is stress (green calm, red maxed out).</span>
        </div>
      </CardContent>
    </Card>
  );
}


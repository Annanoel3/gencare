import { useEffect, useState } from 'react';
import { format } from 'date-fns';

// Has an event happened yet? (Anna, Nov 9 2026: "Should we somehow show when
// items have already been done/past".) For one day's showing of an event
// (an occurrence row: `date` is that day):
//   'past'  once it's over: at its end time, or an hour after it starts when
//           it has no end time; an all-day or several-day event once its day
//           has gone by
//   'now'   from its start time until it's over
//   'later' everything else (all-day events today included)
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// "9:30", "09:30" or "09:30:00" -> "09:30"; anything else -> ''.
const hm = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m && +m[1] < 24 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

export function eventTiming(appt, now = new Date()) {
  const day = String(appt?.date || '');
  if (!DAY.test(day)) return 'later';
  const today = format(now, 'yyyy-MM-dd');
  if (day < today) return 'past';
  if (day > today) return 'later';
  const from = hm(appt.time);
  if (appt.all_day || !from || Number(appt.span_days) > 1) return 'later';
  const start = new Date(`${day}T${from}:00`);
  if (Number.isNaN(start.getTime())) return 'later';
  const to = hm(appt.end_time);
  let end = to && to > from ? new Date(`${day}T${to}:00`) : new Date(start.getTime() + 60 * 60000);
  if (Number.isNaN(end.getTime())) end = new Date(start.getTime() + 60 * 60000);
  if (now >= end) return 'past';
  if (now >= start) return 'now';
  return 'later';
}

// The time now, kept current: once a minute, and right away when the app
// comes back to the front (a phone left on Home for hours). One timer for
// every screen that asks.
const listeners = new Set();
let timer = null;
const tick = () => listeners.forEach((fn) => fn());
const onVisible = () => { if (document.visibilityState === 'visible') tick(); };

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const fn = () => setNow(new Date());
    listeners.add(fn);
    if (!timer) {
      timer = setInterval(tick, 60000);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      listeners.delete(fn);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);
  return now;
}

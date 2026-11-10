import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isValid } from 'date-fns';
import { HeartHandshake } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isLocked, summarize } from '@/lib/careLog';
import { getMemberColorClass } from '@/utils/memberColors';

// What's been logged today in the Care Log, on Home under "Today Across the
// Family" (Anna, Nov 10 2026: "where does that data go? Is it user
// friendly?"), so a feed, a diaper or Mom's lunch is seen without opening
// the Care Log. Newest first; tap to open that person's Care Log.

const first = (s) => String(s || '').trim().split(' ')[0];
const SHOW = 6;

export default function CareLogToday({ members = [] }) {
  const { data: logs = [] } = useQuery({
    queryKey: ['careLog', 'all'],
    queryFn: () => base44.entities.CareLog.list('-timestamp', 1000),
    refetchInterval: 60_000,
  });
  const today = logs
    .filter((l) => !isLocked(l) && l.timestamp && isValid(parseISO(l.timestamp)) && isToday(parseISO(l.timestamp)))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  if (!today.length) return null;

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-rose-500" /> Logged today</h3>
        <Link to="/care-log" className="text-xs text-primary font-medium">Care Log</Link>
      </div>
      <ul className="divide-y divide-border/40">
        {today.slice(0, SHOW).map((l) => {
          const s = summarize(l);
          const m = members.find((x) => x.id === l.family_member_id);
          return (
            <li key={l.id}>
              <Link to={`/care-log?for=${l.family_member_id}`} className="flex items-center gap-3 py-2">
                <span className="text-lg w-6 text-center flex-shrink-0">{s.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${m ? getMemberColorClass(m, members) : 'bg-muted-foreground'}`} />
                    <span className="font-medium">{first(l.family_member_name) || 'Someone'}</span> · {s.label}
                  </span>
                  {s.detail && <span className="block text-xs text-muted-foreground truncate">{s.detail}</span>}
                </span>
                <span className="text-xs text-muted-foreground text-right flex-shrink-0">
                  {format(parseISO(l.timestamp), 'h:mm a')}
                  {l.logged_by_name && <span className="block">{first(l.logged_by_name)}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {today.length > SHOW && <Link to="/care-log" className="block text-center text-xs text-primary font-medium pt-2">And {today.length - SHOW} more in the Care Log</Link>}
    </div>
  );
}

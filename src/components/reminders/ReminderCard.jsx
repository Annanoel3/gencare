import React from 'react';
import { AlertCircle, Clock, Bell, BellOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { adherence, fmtClock, todayStr, frequencyLabel } from '@/lib/reminders';

// One repeating reminder (what, how often, at what times, how it's gone the
// last 14 days). Tap to edit.
export default function ReminderCard({ item, logs, onOpen, inactive }) {
  const runsOutSoon = item.refill_date && new Date(item.refill_date + 'T12:00:00') <= new Date(Date.now() + 7 * 86400000);
  const a = adherence(item, logs);
  return (
    <button type="button" onClick={onOpen} className="text-left w-full block">
      <Card className={`p-4 border-border/50 h-full hover:border-primary/40 transition-colors ${inactive ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{item.medication_name}</h3>
              {runsOutSoon && !inactive && <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="w-3 h-3" /> {item.refill_date < todayStr() ? 'Ran out' : 'Runs out soon'}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{[item.dosage, frequencyLabel(item.frequency)].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              {Array.isArray(item.times) && item.times.length ? (<><Clock className="w-3 h-3" />{item.times.map(fmtClock).join(', ')}</>) : <span>No set times</span>}
              {item.remind === false ? <BellOff className="w-3 h-3 ml-1" aria-label="Reminders off" /> : (item.times?.length ? <Bell className="w-3 h-3 ml-1" aria-label="Reminders on" /> : null)}
            </p>
            {item.notes && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{item.notes}</p>}
            {a.total > 0 && <p className="text-xs text-muted-foreground mt-1">Last 14 days: {a.taken} done{a.missed ? `, ${a.missed} missed` : ''}</p>}
          </div>
        </div>
      </Card>
    </button>
  );
}


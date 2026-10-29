import React from 'react';
import { format, parseISO } from 'date-fns';
import { Moon, Sparkles, Activity } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { STRESS, STRESS_COLORS, moodOf } from '@/lib/wellness';

/**
 * Everything from one day's check-in, in a sheet that slides up from the
 * bottom: mood, stress, sleep, what you did for yourself, and your notes.
 * value is { day: 'yyyy-MM-dd', c: checkin | null }.
 */
export default function DaySheet({ value, onClose, onEditToday }) {
  const open = !!value;
  const c = value?.c || null;
  const m = moodOf(c);
  const isTodayDay = value?.day === format(new Date(), 'yyyy-MM-dd');

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DrawerContent className="max-h-[85vh]">
        {value && (
          <div className="overflow-y-auto px-5 pb-8">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle className="font-heading text-xl">{format(parseISO(value.day), 'EEEE, MMMM d')}</DrawerTitle>
              <DrawerDescription>{c ? 'Only you can see this.' : "You didn't check in this day."}</DrawerDescription>
            </DrawerHeader>

            {c && (
              <div className="space-y-4">
                {m && (
                  <div className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${m.color}`}>
                    <span className="text-4xl">{m.emoji}</span>
                    <span className="font-heading text-lg font-semibold">{m.label}</span>
                  </div>
                )}
                {(c.stress || typeof c.sleep_hours === 'number') && (
                  <div className="grid grid-cols-2 gap-2">
                    {c.stress ? (
                      <div className="rounded-xl bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> Stress</p>
                        <p className="font-medium mt-0.5 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${STRESS_COLORS[c.stress - 1]}`} />{STRESS[c.stress - 1]}</p>
                      </div>
                    ) : <span />}
                    {typeof c.sleep_hours === 'number' && (
                      <div className="rounded-xl bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Sleep</p>
                        <p className="font-medium mt-0.5">{c.sleep_hours} hours</p>
                      </div>
                    )}
                  </div>
                )}
                {Array.isArray(c.self_care) && c.self_care.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5"><Sparkles className="w-3.5 h-3.5" /> Did for yourself</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.self_care.map((s) => <span key={s} className="rounded-full border border-primary/40 bg-primary/10 text-primary px-3 py-1 text-xs font-medium">{s}</span>)}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
                  {c.note ? <p className="text-sm whitespace-pre-wrap rounded-xl bg-muted/40 p-3">{c.note}</p> : <p className="text-sm text-muted-foreground">No notes this day.</p>}
                </div>
              </div>
            )}

            {isTodayDay && (
              <Button variant="outline" className="w-full rounded-xl mt-5" onClick={() => { onClose?.(); onEditToday?.(); }}>
                {c ? "Change today's check-in" : 'Check in for today'}
              </Button>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

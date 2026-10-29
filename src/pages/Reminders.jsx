import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { BellRing, Plus, AlertCircle, Clock, Bell, BellOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { withFamily, useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId } from '@/utils/memberColors';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import TodaySlots from '@/components/reminders/TodaySlots';
import { REMINDERS_KEY, listReminders, cleanMed, adherence, fmtClock, todayStr, frequencyLabel } from '@/lib/reminders';

/**
 * Reminders: today's reminders to tick off at the top, then every reminder
 * per person. The pushes at each time, the "not done yet?" push and the
 * runs-out push come from the reminder job (functions/cronReminders).
 */
export default function Reminders() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState({ open: false, med: null });
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const today = todayStr();

  const { data: reminders = [], isFetched } = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders });
  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list() });
  const since = format(new Date(Date.now() - 14 * 86400000), 'yyyy-MM-dd');
  const { data: logs = [] } = useQuery({ queryKey: ['reminderLogs', since], queryFn: () => base44.entities.MedicationLog.filter({ day: { $gte: since } }, '-day', 500) });

  // A push tap lands on its reminder (?item=, or ?med= from older pushes);
  // ?new=1 (the + button's "Reminder") opens a blank one.
  useEffect(() => {
    if (!isFetched) return;
    const id = params.get('item') || params.get('med');
    const isNew = params.get('new');
    if (!id && !isNew) return;
    if (isNew) setDialog({ open: true, med: null });
    else {
      const m = reminders.find((x) => x.id === id);
      if (m) setDialog({ open: true, med: m });
    }
    const next = new URLSearchParams(params); next.delete('item'); next.delete('med'); next.delete('new'); setParams(next, { replace: true });
  }, [isFetched, reminders]);  

  const refresh = () => { queryClient.invalidateQueries({ queryKey: REMINDERS_KEY }); queryClient.invalidateQueries({ queryKey: ['reminderLogs'] }); };

  const save = useMutation({
    mutationFn: async (form) => {
      const data = cleanMed(form, members);
      if (dialog.med?.id) return base44.entities.Medication.update(dialog.med.id, data);
      return base44.entities.Medication.create(withFamily(data));
    },
    onSuccess: () => { refresh(); setDialog({ open: false, med: null }); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: async (med) => {
      const mine = (await base44.entities.MedicationLog.filter({ medication_id: med.id })) || [];
      for (const l of mine) await base44.entities.MedicationLog.delete(l.id);
      return base44.entities.Medication.delete(med.id);
    },
    onSuccess: () => { refresh(); setDialog({ open: false, med: null }); },
  });

  const active = reminders.filter((m) => m.is_active !== false);
  const paused = reminders.filter((m) => m.is_active === false);
  const byMember = groupBy(active, (m) => m.family_member_name || 'Everyone');

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><BellRing className="w-7 h-7 text-primary" /> Reminders</h1>
          <p className="text-muted-foreground mt-1">Things that happen at set times. Everyone gets reminded, and anyone can mark them done.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, med: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Add reminder</span></Button>
      </div>

      <TodaySlots members={members} className="mb-8" />

      {reminders.length === 0 ? (
        <div className="text-center py-16">
          <BellRing className="w-14 h-14 mx-auto mb-3 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-1">No reminders yet</h2>
          <p className="text-muted-foreground text-sm mb-5">Add one and set its times; the whole family gets reminded.</p>
          <Button onClick={() => setDialog({ open: true, med: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add reminder</Button>
        </div>
      ) : (
        <>
          {Object.entries(byMember).map(([name, items]) => (
            <section key={name} className="mb-6">
              <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${getMemberColorByMemberId(items[0].family_member_id, members)}`} />{name}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => setDialog({ open: true, med: m })} />)}
              </div>
            </section>
          ))}
          {paused.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Paused ({paused.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paused.map((m) => <ReminderCard key={m.id} item={m} logs={logs} onOpen={() => setDialog({ open: true, med: m })} inactive />)}
              </div>
            </section>
          )}
        </>
      )}

      <ReminderDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        med={dialog.med}
        members={members}
        onSave={(form) => save.mutate(form)}
        onDelete={(m) => remove.mutate(m)}
        saving={save.isPending || remove.isPending}
        adherence={dialog.med ? adherence(dialog.med, logs) : null}
      />
    </div>
  );
}

function ReminderCard({ item, logs, onOpen, inactive }) {
  const runsOutSoon = item.refill_date && new Date(item.refill_date + 'T12:00:00') <= new Date(Date.now() + 7 * 86400000);
  const a = adherence(item, logs);
  return (
    <button onClick={onOpen} className="text-left">
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

function groupBy(list, keyOf) {
  const out = {};
  for (const x of list) (out[keyOf(x)] ||= []).push(x);
  return out;
}

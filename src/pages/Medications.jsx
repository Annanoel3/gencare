import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Pill, Plus, AlertCircle, Check, Clock, X, Bell, BellOff, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { withFamily, useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId } from '@/utils/memberColors';
import MedicationDialog from '@/components/medications/MedicationDialog';
import { slotsForDay, markDose, cleanMed, adherence, fmtClock, todayStr } from '@/lib/medications';

/**
 * Medications: today's doses to tick off at the top, then every medication
 * per person. Dose pushes, missed-dose pushes and refill pushes come from the
 * reminder job (functions/cronReminders) using the times set here.
 */
export default function Medications() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState({ open: false, med: null });
  const [busyKey, setBusyKey] = useState(null);
  const queryClient = useQueryClient();
  const { me } = useFamily();
  const today = todayStr();

  const { data: medications = [] } = useQuery({ queryKey: ['medications'], queryFn: () => base44.entities.Medication.list('-created_date', 200) });
  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list() });
  const since = format(new Date(Date.now() - 14 * 86400000), 'yyyy-MM-dd');
  const { data: logs = [] } = useQuery({ queryKey: ['medicationLogs', since], queryFn: () => base44.entities.MedicationLog.filter({ day: { $gte: since } }, '-day', 500) });

  // A push tap lands on its medication.
  useEffect(() => {
    const id = params.get('med');
    if (!id || !medications.length) return;
    const m = medications.find((x) => x.id === id);
    if (m) setDialog({ open: true, med: m });
    const next = new URLSearchParams(params); next.delete('med'); setParams(next, { replace: true });
  }, [medications]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['medications'] }); queryClient.invalidateQueries({ queryKey: ['medicationLogs'] }); };

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

  const slots = useMemo(() => slotsForDay(medications, logs, today), [medications, logs, today]);
  const mark = async (slot, status) => {
    setBusyKey(slot.key);
    try { await markDose(slot, status, me); } catch (e) { toast({ title: "Couldn't save", description: e?.message, variant: 'destructive' }); }
    finally { setBusyKey(null); }
    queryClient.invalidateQueries({ queryKey: ['medicationLogs'] });
  };

  const active = medications.filter((m) => m.is_active !== false);
  const stopped = medications.filter((m) => m.is_active === false);
  const byMember = groupBy(active, (m) => m.family_member_name || 'Unassigned');
  const nowClock = format(new Date(), 'HH:mm');

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><Pill className="w-7 h-7 text-primary" /> Medications</h1>
          <p className="text-muted-foreground mt-1">Who takes what, when, and whether today's doses happened.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, med: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Add medication</span></Button>
      </div>

      {slots.length > 0 && (
        <section className="mb-8">
          <h2 className="font-heading text-base font-semibold mb-2">Today's doses</h2>
          <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/50">
            {slots.map((s) => {
              const color = getMemberColorByMemberId(s.med.family_member_id, members);
              const done = s.status === 'taken' || s.status === 'skipped';
              const late = s.status === 'missed' || (s.status === 'due' && s.time < nowClock);
              const busy = busyKey === s.key;
              return (
                <div key={s.key} className={`flex items-center gap-3 p-3 ${done ? 'opacity-60' : ''}`}>
                  <span className={`w-1.5 self-stretch rounded-full ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${s.status === 'taken' ? 'line-through' : ''}`}>{s.med.medication_name}{s.med.dosage ? ` · ${s.med.dosage}` : ''}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.med.family_member_name} · {fmtClock(s.time)}
                      {s.status === 'taken' && s.log?.taken_by_name ? ` · taken by ${s.log.taken_by_name.split(' ')[0]}` : ''}
                      {s.status === 'skipped' ? ' · skipped' : ''}
                      {s.status === 'missed' ? ' · missed' : ''}
                    </p>
                  </div>
                  {done ? (
                    <Button variant="ghost" size="sm" onClick={() => mark(s, 'due')} disabled={busy} className="text-xs">Undo</Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => mark(s, 'skipped')} disabled={busy} aria-label="Skip" className="rounded-full text-muted-foreground"><X className="w-4 h-4" /></Button>
                      <Button size="sm" onClick={() => mark(s, 'taken')} disabled={busy} className={`rounded-xl gap-1 ${late ? '' : 'bg-primary/90'}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Taken</Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {medications.length === 0 ? (
        <div className="text-center py-16">
          <Pill className="w-14 h-14 mx-auto mb-3 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-1">No medications yet</h2>
          <p className="text-muted-foreground text-sm mb-5">Add one and set its times; the whole family gets reminded.</p>
          <Button onClick={() => setDialog({ open: true, med: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add medication</Button>
        </div>
      ) : (
        <>
          {Object.entries(byMember).map(([name, meds]) => (
            <section key={name} className="mb-6">
              <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${getMemberColorByMemberId(meds[0].family_member_id, members)}`} />{name}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {meds.map((m) => <MedCard key={m.id} med={m} logs={logs} onOpen={() => setDialog({ open: true, med: m })} />)}
              </div>
            </section>
          ))}
          {stopped.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stopped ({stopped.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {stopped.map((m) => <MedCard key={m.id} med={m} logs={logs} onOpen={() => setDialog({ open: true, med: m })} inactive />)}
              </div>
            </section>
          )}
        </>
      )}

      <MedicationDialog
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

function MedCard({ med, logs, onOpen, inactive }) {
  const refillSoon = med.refill_date && new Date(med.refill_date + 'T12:00:00') <= new Date(Date.now() + 7 * 86400000);
  const a = adherence(med, logs);
  return (
    <button onClick={onOpen} className="text-left">
      <Card className={`p-4 border-border/50 h-full hover:border-primary/40 transition-colors ${inactive ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{med.medication_name}</h3>
              {refillSoon && !inactive && <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="w-3 h-3" /> Refill {med.refill_date < todayStr() ? 'overdue' : 'soon'}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              {Array.isArray(med.times) && med.times.length ? (<><Clock className="w-3 h-3" />{med.times.map(fmtClock).join(', ')}</>) : <span>No set times</span>}
              {med.remind === false ? <BellOff className="w-3 h-3 ml-1" aria-label="Reminders off" /> : (med.times?.length ? <Bell className="w-3 h-3 ml-1" aria-label="Reminders on" /> : null)}
            </p>
            {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">{med.instructions}</p>}
            {a.total > 0 && <p className="text-xs text-muted-foreground mt-1">Last 14 days: {a.taken} taken{a.missed ? `, ${a.missed} missed` : ''}</p>}
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

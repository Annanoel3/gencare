import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { format, parseISO, isValid, isToday, isYesterday } from 'date-fns';
import { HeartHandshake, Plus, CalendarClock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily, orderMembers } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatAge } from '@/utils/age';
import { getMemberColorClass, getMemberLightColorByMemberId } from '@/utils/memberColors';
import LogDialog from '@/components/carelog/LogDialog';
import LogRow from '@/components/carelog/LogRow';
import { BANDS, CATALOG, bandOf, cleanLog, createLog, updateLog, deleteLog, todayStats, upcoming, summarize } from '@/lib/careLog';

/**
 * One care log for every person. Pick a person; the tiles, today's numbers
 * and the list are theirs, and which tiles appear depends on their age. A
 * person moving from one band to the next keeps every entry.
 */
export default function CareLogPage() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState({ open: false, entry: null, type: null });
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();
  const { me } = useFamily();

  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list('-created_date') });
  // Same order as everywhere else (you, the other people, then pets); the
  // page opens on the first person who isn't you, since that's who you log for.
  const active = useMemo(() => orderMembers(members.filter((m) => m.is_active !== false), me?.id), [members, me?.id]);
  const [personId, setPersonId] = useState(params.get('for') || '');
  const person = active.find((m) => m.id === personId) || active.find((m) => !(m.linked_user_id && m.linked_user_id === me?.id)) || active[0] || null;
  useEffect(() => { if (person && person.id !== personId) setPersonId(person.id); }, [person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!personId) return;
    const next = new URLSearchParams(params); next.set('for', personId); setParams(next, { replace: true });
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allLogs = [], isLoading } = useQuery({ queryKey: ['careLog', 'all'], queryFn: () => base44.entities.CareLog.list('-timestamp', 1000) });
  const logs = useMemo(() => allLogs.filter((l) => l.family_member_id === person?.id).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [allLogs, person?.id]);

  const band = bandOf(person);
  const types = CATALOG[band] || CATALOG.general;
  const stats = useMemo(() => todayStats(band, logs), [band, logs]);
  const soon = useMemo(() => upcoming(logs).slice(0, 6), [logs]);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['careLog'] }); };
  const save = useMutation({
    mutationFn: ({ form, def }) => {
      const row = cleanLog(form, def, person, me);
      if (dialog.entry?.id) { delete row.logged_by_user_id; delete row.logged_by_name; return updateLog(dialog.entry.id, row); }
      return createLog(row);
    },
    onSuccess: () => { refresh(); setDialog({ open: false, entry: null, type: null }); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({ mutationFn: (entry) => deleteLog(entry.id), onSuccess: () => { refresh(); setDialog({ open: false, entry: null, type: null }); } });

  const grouped = useMemo(() => {
    const map = new Map();
    for (const l of (showAll ? logs : logs.slice(0, 40))) {
      const d = l.timestamp ? parseISO(l.timestamp) : null;
      const key = d && isValid(d) ? format(d, 'yyyy-MM-dd') : 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    }
    return [...map.entries()];
  }, [logs, showAll]);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><HeartHandshake className="w-7 h-7 text-primary" /> Care Log</h1>
          <p className="text-muted-foreground mt-1">Day-to-day care for each person, with the right things to track for their age.</p>
        </div>
        {person && <Button onClick={() => setDialog({ open: true, entry: null, type: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Log something</span></Button>}
      </div>

      {active.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <h3 className="font-heading text-lg font-semibold mb-2">No family members yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Add the people you care for, with a birthdate, and this page sets itself up for each of them.</p>
          <Button asChild className="rounded-xl gap-2"><Link to="/family"><Plus className="w-4 h-4" /> Add family member</Link></Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {active.map((m) => (
              <button key={m.id} type="button" onClick={() => { setPersonId(m.id); setShowAll(false); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${m.id === person?.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(m, members)}`} />{m.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {person && (
            <>
              <div className={`flex items-center gap-3 rounded-2xl p-4 mb-5 ${getMemberLightColorByMemberId(person.id, members)}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(person, members)}`}>{person.name?.charAt(0)?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-lg font-semibold">{person.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {band === 'pet' ? (person.birthdate ? `${formatAge(person.birthdate)} · Pet` : 'Pet') : person.birthdate ? `${formatAge(person.birthdate)} · ${BANDS[band].label}` : <>No birthdate yet — <Link to={`/family/${person.id}`} className="text-primary underline">add one</Link> and this page fits itself to their age.</>}
                  </p>
                </div>
                <Link to={`/family/${person.id}`} className="text-sm text-primary hover:underline">Profile</Link>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-6">
                {types.map((t) => (
                  <button key={t.type} type="button" onClick={() => setDialog({ open: true, entry: null, type: t.type })}
                    className="bg-card rounded-2xl border border-border/50 p-3 flex flex-col items-center gap-1.5 hover:border-primary/40 hover:shadow-sm transition-all">
                    <span className="text-2xl leading-none">{t.icon}</span>
                    <span className="text-xs font-medium text-center leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {stats.map(([label, value]) => (
                  <div key={label} className="bg-card rounded-2xl border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-heading text-lg font-semibold truncate">{value}</p>
                  </div>
                ))}
              </div>

              {soon.length > 0 && (
                <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
                  <h3 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Coming up</h3>
                  <div className="divide-y divide-border/40">
                    {soon.map((l) => {
                      const s = summarize(l);
                      return (
                        <button key={l.id} type="button" onClick={() => setDialog({ open: true, entry: l, type: l.entry_type })} className="w-full text-left flex items-center gap-3 py-2">
                          <span className="text-xs text-muted-foreground w-14 flex-shrink-0">{format(parseISO(l.due_date || l.date), 'MMM d')}</span>
                          <span className="text-base">{s.icon}</span>
                          <span className="text-sm flex-1 min-w-0 truncate">{l.title || s.label}{l.time ? ` · ${l.time}` : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-card rounded-2xl border border-border/50 p-2 md:p-4">
                <h3 className="font-heading text-base font-semibold mb-2 px-2">History</h3>
                {isLoading ? <p className="text-sm text-muted-foreground px-2 py-6 text-center">Loading…</p>
                  : logs.length === 0 ? <p className="text-sm text-muted-foreground px-2 py-6 text-center">Nothing logged for {person.name.split(' ')[0]} yet. Tap a tile above.</p>
                  : grouped.map(([day, list]) => (
                    <div key={day} className="mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">{dayLabel(day)}</p>
                      {list.map((l) => <LogRow key={l.id} entry={l} onOpen={(e) => setDialog({ open: true, entry: e, type: e.entry_type })} />)}
                    </div>
                  ))}
                {!showAll && logs.length > 40 && <Button variant="ghost" size="sm" onClick={() => setShowAll(true)} className="w-full">Show all {logs.length}</Button>}
              </div>
            </>
          )}
        </>
      )}

      {person && (
        <LogDialog
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          member={person}
          entry={dialog.entry}
          type={dialog.type}
          onSave={(form, def) => save.mutate({ form, def })}
          onDelete={(e) => remove.mutate(e)}
          saving={save.isPending || remove.isPending}
        />
      )}
    </div>
  );
}

function dayLabel(day) {
  if (day === 'unknown') return 'Undated';
  const d = parseISO(day);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

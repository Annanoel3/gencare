import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { format, parseISO, isValid, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { HeartHandshake, Plus, CalendarClock, Check, History } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily, orderMembers } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatAge } from '@/utils/age';
import { getMemberColorClass, getMemberLightColorByMemberId } from '@/utils/memberColors';
import LogDialog from '@/components/carelog/LogDialog';
import LogRow from '@/components/carelog/LogRow';
import VaultSection from '@/components/carelog/VaultSection';
import { track } from '@/lib/activity';
import { bandOf, cleanLog, createLog, updateLog, deleteLog, upcoming, summarize, isLocked, QUICK, matchesQuick, quickRow } from '@/lib/careLog';

const isPet = (m) => /^pet$/i.test(String(m?.relationship || ''));
const firstName = (s) => String(s || '').split(' ')[0];

/**
 * The family's shared care log (Anna, Oct 29 2026: it "looks like a feature
 * nobody would ever use"). Pick a person, then one tap logs what just
 * happened (lunch, a walk, a shower) as you, so everyone can see what's
 * already done today without asking. "Last time" answers "when did Mom last
 * shower?", and Legal & financial sits behind the family's folder password.
 * Which buttons show depends on the person's age (lib/careLog.js QUICK).
 */
export default function CareLogPage() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState({ open: false, entry: null, type: null, preset: null });
  const [showAll, setShowAll] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const queryClient = useQueryClient();
  const { me } = useFamily();

  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list('-created_date') });
  // Same order as everywhere else (you, the other people, then pets); the
  // page opens on the first person who isn't you, since that's who you log for.
  const active = useMemo(() => orderMembers(members.filter((m) => m.is_active !== false), me?.id), [members, me?.id]);
  const people = useMemo(() => active.filter((m) => !isPet(m)), [active]);
  const [personId, setPersonId] = useState(params.get('for') || '');
  const person = active.find((m) => m.id === personId) || active.find((m) => !(m.linked_user_id && m.linked_user_id === me?.id)) || active[0] || null;
  useEffect(() => { if (person && person.id !== personId) setPersonId(person.id); }, [person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!personId) return;
    const next = new URLSearchParams(params); next.set('for', personId); setParams(next, { replace: true });
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allLogs = [], isLoading } = useQuery({ queryKey: ['careLog', 'all'], queryFn: () => base44.entities.CareLog.list('-timestamp', 1000) });
  const logs = useMemo(() => allLogs.filter((l) => l.family_member_id === person?.id && !isLocked(l)).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [allLogs, person?.id]);
  const todays = useMemo(() => logs.filter((l) => l.timestamp && isToday(parseISO(l.timestamp))), [logs]);
  const earlier = useMemo(() => logs.filter((l) => !(l.timestamp && isToday(parseISO(l.timestamp)))), [logs]);

  const band = bandOf(person);
  const quick = QUICK[band] || QUICK.general;
  const doneToday = (q) => todays.find((e) => matchesQuick(q, e));
  const lastTimes = useMemo(() => quick.filter((q) => q.last).map((q) => [q, logs.find((e) => matchesQuick(q, e))]).filter(([, e]) => e), [quick, logs]);
  const soon = useMemo(() => upcoming(logs).slice(0, 6), [logs]);
  const first = firstName(person?.name);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['careLog'] }); };
  const openEntry = (e) => setDialog({ open: true, entry: e, type: e.entry_type, preset: null });
  const save = useMutation({
    mutationFn: ({ form, def }) => {
      const row = cleanLog(form, def, person, me);
      if (dialog.entry?.id) { delete row.logged_by_user_id; delete row.logged_by_name; return updateLog(dialog.entry.id, row); }
      return createLog(row);
    },
    onSuccess: () => { refresh(); track('action', dialog.entry?.id ? 'log:changed' : `log:${dialog.type || 'other'}`); setDialog({ open: false, entry: null, type: null, preset: null }); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({ mutationFn: (entry) => deleteLog(entry.id), onSuccess: () => { refresh(); setDialog({ open: false, entry: null, type: null, preset: null }); } });

  // One tap: log it now. Things that need a detail open the form instead, and
  // a meal or shower that's already logged today opens that entry.
  const tap = async (q) => {
    if (!person || busyKey) return;
    if (q.ask) { setDialog({ open: true, entry: null, type: q.row.entry_type, preset: q.row }); return; }
    const already = q.daily && doneToday(q);
    if (already) { openEntry(already); return; }
    setBusyKey(q.key);
    try {
      const made = await createLog(quickRow(q, person, me));
      refresh();
      track('action', `log:${q.key}`);
      const t = toast({
        title: `${q.icon} ${q.label} logged for ${first}`,
        description: 'Everyone in the family can see it.',
        action: (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium" onClick={async () => { t.dismiss(); try { await deleteLog(made.id); refresh(); } catch (e) { /* it stays */ } }}>Undo</button>
            <button type="button" className="h-8 rounded-md border px-3 text-sm font-medium" onClick={() => { t.dismiss(); openEntry(made); }}>Add details</button>
          </div>
        ),
      });
    } catch (e) {
      toast({ title: "Couldn't log it", description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusyKey(''); }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const l of (showAll ? earlier : earlier.slice(0, 30))) {
      const d = l.timestamp ? parseISO(l.timestamp) : null;
      const key = d && isValid(d) ? format(d, 'yyyy-MM-dd') : 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    }
    return [...map.entries()];
  }, [earlier, showAll]);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-4">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><HeartHandshake className="w-7 h-7 text-primary" /> Care Log</h1>
        <p className="text-muted-foreground mt-1">Who did what today, so nobody has to ask.</p>
      </div>

      {active.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <h3 className="font-heading text-lg font-semibold mb-2">No family members yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Add the people you care for, with a birthdate, and this page sets itself up for each of them.</p>
          <Button asChild className="rounded-xl gap-2"><Link to="/family"><Plus className="w-4 h-4" /> Add family member</Link></Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {active.map((m) => (
              <button key={m.id} type="button" onClick={() => { setPersonId(m.id); setShowAll(false); }}
                className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${m.id === person?.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(m, members)}`} />{firstName(m.name)}
              </button>
            ))}
          </div>

          {person && (
            <div className="space-y-5">
              <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${getMemberLightColorByMemberId(person.id, members)}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(person, members)}`}>{person.name?.charAt(0)?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-semibold truncate">{person.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {band === 'pet' ? (person.birthdate ? `${formatAge(person.birthdate)} · Pet` : 'Pet') : person.birthdate ? formatAge(person.birthdate) : <>No birthdate yet. <Link to={`/family/${person.id}`} className="text-primary underline">Add one</Link> and the buttons fit their age.</>}
                  </p>
                </div>
                <Link to={`/family/${person.id}`} className="text-sm text-primary">Profile</Link>
              </div>

              <section>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Tap when it happens</h2>
                <div className="grid grid-cols-3 gap-2">
                  {quick.map((q) => {
                    const done = doneToday(q);
                    return (
                      <button key={q.key} type="button" onClick={() => tap(q)} disabled={busyKey === q.key}
                        className={`rounded-2xl border p-2.5 min-h-[76px] flex flex-col items-center justify-center gap-1 text-center transition-all active:scale-95 ${done ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border/60 bg-card'}`}>
                        <span className="text-2xl leading-none">{q.icon}</span>
                        <span className="text-xs font-medium leading-tight">{q.label}</span>
                        {done && <span className="text-[10px] leading-tight text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />{format(parseISO(done.timestamp), 'h:mm a')}{done.logged_by_name ? ` · ${firstName(done.logged_by_name)}` : ''}</span>}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setDialog({ open: true, entry: null, type: null, preset: null })}
                    className="rounded-2xl border border-dashed border-border p-2.5 min-h-[76px] flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Plus className="w-5 h-5" />
                    <span className="text-xs font-medium">Something else</span>
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-border/50 bg-card p-2 md:p-4">
                <h2 className="font-heading text-base font-semibold px-2 pt-1">Today {todays.length > 0 && <span className="text-muted-foreground font-normal text-sm">({todays.length})</span>}</h2>
                {isLoading ? <p className="text-sm text-muted-foreground px-2 py-4">Loading…</p>
                  : todays.length === 0 ? <p className="text-sm text-muted-foreground px-2 py-3">Nothing logged for {first} today. When someone taps {quick[0]?.label} or {quick[3]?.label || quick[1]?.label}, it shows up here with who did it.</p>
                  : todays.map((l) => <LogRow key={l.id} entry={l} onOpen={openEntry} />)}
              </section>

              {lastTimes.length > 0 && (
                <section className="rounded-2xl border border-border/50 bg-card p-4">
                  <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Last time</h2>
                  <ul className="space-y-2">
                    {lastTimes.map(([q, e]) => (
                      <li key={q.key}>
                        <button type="button" onClick={() => openEntry(e)} className="w-full flex items-center gap-3 text-left">
                          <span className="text-lg w-6 text-center">{q.icon}</span>
                          <span className="text-sm font-medium flex-1">{q.label}</span>
                          <span className="text-sm text-muted-foreground text-right">{sinceText(e.timestamp)}{e.logged_by_name ? ` · ${firstName(e.logged_by_name)}` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {soon.length > 0 && (
                <section className="rounded-2xl border border-border/50 bg-card p-4">
                  <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Coming up</h2>
                  <div className="divide-y divide-border/40">
                    {soon.map((l) => {
                      const s = summarize(l);
                      return (
                        <button key={l.id} type="button" onClick={() => openEntry(l)} className="w-full text-left flex items-center gap-3 py-2">
                          <span className="text-xs text-muted-foreground w-14 flex-shrink-0">{format(parseISO(l.due_date || l.date), 'MMM d')}</span>
                          <span className="text-base">{s.icon}</span>
                          <span className="text-sm flex-1 min-w-0 truncate">{l.title || s.label}{l.time ? ` · ${l.time}` : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {!isPet(person) && <VaultSection person={person} people={people} />}

              {earlier.length > 0 && (
                <section className="rounded-2xl border border-border/50 bg-card p-2 md:p-4">
                  <h2 className="font-heading text-base font-semibold mb-1 px-2 pt-1">Earlier</h2>
                  {grouped.map(([day, list]) => (
                    <div key={day} className="mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">{dayLabel(day)}</p>
                      {list.map((l) => <LogRow key={l.id} entry={l} onOpen={openEntry} />)}
                    </div>
                  ))}
                  {!showAll && earlier.length > 30 && <Button variant="ghost" size="sm" onClick={() => setShowAll(true)} className="w-full">Show all {earlier.length}</Button>}
                </section>
              )}
            </div>
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
          preset={dialog.preset}
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

/** "Today 9:10 AM", "Yesterday 8:10 PM", "Mon · 3 days ago", "Oct 2 · 27 days ago". */
function sinceText(iso) {
  const d = iso ? parseISO(iso) : null;
  if (!d || !isValid(d)) return '';
  if (isToday(d)) return `Today ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  const days = differenceInCalendarDays(new Date(), d);
  return days < 7 ? `${format(d, 'EEE')} · ${days} days ago` : `${format(d, 'MMM d')} · ${days} days ago`;
}

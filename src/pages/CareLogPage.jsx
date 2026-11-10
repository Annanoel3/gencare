import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import BabyTimers from '@/components/carelog/BabyTimers';
import PersonToday from '@/components/carelog/PersonToday';
import WeekSummary from '@/components/carelog/WeekSummary';
import Trackers from '@/components/carelog/Trackers';
import MilkStash from '@/components/carelog/MilkStash';
import { addBag, STASH_KEY } from '@/lib/milkStash';
import { reloadWidgets } from '@/lib/widgets';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { youngerThan18 } from '@/components/family/CaredForSwitch';
import { track } from '@/lib/activity';
import { bandOf, ageMonths, cleanLog, createLog, updateLog, deleteLog, upcoming, summarize, isLocked, QUICK, matchesQuick, quickRow } from '@/lib/careLog';

const isPet = (m) => /^pet$/i.test(String(m?.relationship || ''));
// Who has a Care Log (Anna, Nov 10 2026): the people the family takes care of
// (their profile says so, or they're under 18 and it doesn't say otherwise)
// and the pets. Not everyone in the family.
const caredFor = (m) => isPet(m) || m?.cared_for === true || (m?.cared_for !== false && youngerThan18(m?.birthdate));
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
  const active = useMemo(() => orderMembers(members.filter((m) => m.is_active !== false && caredFor(m)), me?.id), [members, me?.id]);
  const [personId, setPersonId] = useState(params.get('for') || '');
  const person = active.find((m) => m.id === personId) || active[0] || null;
  useEffect(() => { if (person && person.id !== personId) setPersonId(person.id); }, [person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened again on someone else (from the home-screen widget, with the page already open).
  const forParam = params.get('for') || '';
  useEffect(() => { if (forParam && forParam !== personId && active.some((m) => m.id === forParam)) setPersonId(forParam); }, [forParam, active.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!personId) return;
    const next = new URLSearchParams(params); next.set('for', personId); setParams(next, { replace: true });
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allLogs = [], isLoading } = useQuery({ queryKey: ['careLog', 'all'], queryFn: () => base44.entities.CareLog.list('-timestamp', 1000) });
  const logs = useMemo(() => allLogs.filter((l) => l.family_member_id === person?.id && !isLocked(l)).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [allLogs, person?.id]);
  const todays = useMemo(() => logs.filter((l) => l.timestamp && isToday(parseISO(l.timestamp))), [logs]);
  const earlier = useMemo(() => logs.filter((l) => !(l.timestamp && isToday(parseISO(l.timestamp)))), [logs]);

  const band = bandOf(person);
  // Some buttons wait for an age (solid food from about 4 months).
  const months = ageMonths(person?.birthdate);
  const fitsAge = (QUICK[band] || QUICK.general).filter((q) => !q.minMonths || (months !== null && months >= q.minMonths));
  // Buttons the family hid for this person ("Choose buttons"; Nov 10 2026).
  const hidden = Array.isArray(person?.care_hidden) ? person.care_hidden : [];
  const quick = fitsAge.filter((q) => !hidden.includes(q.key));
  const [choosing, setChoosing] = useState(false);
  const setHidden = async (key, show) => {
    const next = show ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
    try {
      await base44.entities.FamilyMember.update(person.id, { care_hidden: next });
      queryClient.invalidateQueries({ queryKey: ['familyMembers'] });
    } catch {
      toast({ title: "Couldn't save that", description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };
  const doneToday = (q) => todays.find((e) => matchesQuick(q, e));
  const lastTimes = useMemo(() => quick.filter((q) => q.last).map((q) => [q, logs.find((e) => matchesQuick(q, e))]).filter(([, e]) => e), [quick, logs]);
  const soon = useMemo(() => upcoming(logs).slice(0, 6), [logs]);
  const first = firstName(person?.name);

  // The Care Log widget on this phone's home screen shows it too.
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['careLog'] }); reloadWidgets(); };
  const openEntry = (e) => setDialog({ open: true, entry: e, type: e.entry_type, preset: null });
  const save = useMutation({
    mutationFn: async ({ form, def }) => {
      // "Put it in the milk stash" isn't part of the entry: it adds a bag.
      const { stash, ...row } = cleanLog(form, def, person, me);
      if (dialog.entry?.id) { delete row.logged_by_user_id; delete row.logged_by_name; return updateLog(dialog.entry.id, row); }
      const saved = await createLog(row);
      if (row.entry_type === 'pumping' && ['fridge', 'freezer'].includes(stash) && row.amount > 0) {
        try {
          await addBag({ person, amount: row.amount, place: stash, pumpedAt: row.timestamp, me, pumpingLogId: saved?.id });
          queryClient.invalidateQueries({ queryKey: STASH_KEY });
          toast({ title: `${row.amount} oz in the ${stash}`, description: 'Added to the milk stash.' });
        } catch {
          toast({ title: "The pumping is logged, but it didn't go in the stash", description: 'Add it with Add milk in the milk stash.', variant: 'destructive' });
        }
      }
      return saved;
    },
    onSuccess: (saved) => {
      refresh();
      track('action', dialog.entry?.id ? 'log:changed' : `log:${dialog.type || 'other'}`);
      // A new fall goes to the whole family right away (functions/notifyFamily).
      if (!dialog.entry?.id && saved?.id && saved.entry_type === 'care_log' && saved.sub_type === 'fall') {
        base44.functions.invoke('notifyFamily', { kind: 'care_alert', log_id: saved.id }).catch(() => {});
        toast({ title: 'The family has been told', description: `Everyone gets a notification about ${first}'s fall.` });
      }
      setDialog({ open: false, entry: null, type: null, preset: null });
    },
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

  // From the home-screen widget: /care-log?for=<person>&log=<button>. A button
  // that needs details opens its form; one that doesn't (on an iPhone too old
  // for buttons that work right on the widget) logs it, with Undo. Once.
  const logParam = params.get('log') || '';
  const handled = useRef('');
  useEffect(() => {
    if (!logParam || !person || isLoading || busyKey) return;
    if (forParam && person.id !== forParam) return;
    const tag = `${person.id}:${logParam}:${params.toString()}`;
    if (handled.current === tag) return;
    handled.current = tag;
    const next = new URLSearchParams(params); next.delete('log'); setParams(next, { replace: true });
    const q = fitsAge.find((x) => x.key === logParam);
    if (q) { track('action', 'widget: opened to log', q.key); tap(q); }
  }, [logParam, person?.id, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <h3 className="font-heading text-lg font-semibold mb-2">Who does the family take care of?</h3>
          <p className="text-sm text-muted-foreground mb-6">Open their profile on the Family page and turn on "The family helps take care of them." Babies, kids and pets show up here on their own.</p>
          <Button asChild className="rounded-xl gap-2"><Link to="/family"><Plus className="w-4 h-4" /> Go to Family</Link></Button>
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

          <p className="text-xs text-muted-foreground -mt-2 mb-4">Someone missing? On their profile, turn on "The family helps take care of them."</p>

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

              {band === 'baby' && <BabyTimers person={person} logs={logs} me={me} onChanged={refresh} />}
              <PersonToday person={person} members={members} />

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
                <button type="button" onClick={() => setChoosing(true)} className="text-xs text-primary font-medium mt-2">Choose buttons</button>
              </section>

              <section className="rounded-2xl border border-border/50 bg-card p-2 md:p-4">
                <h2 className="font-heading text-base font-semibold px-2 pt-1">Today {todays.length > 0 && <span className="text-muted-foreground font-normal text-sm">({todays.length})</span>}</h2>
                {isLoading ? <p className="text-sm text-muted-foreground px-2 py-4">Loading…</p>
                  : todays.length === 0 ? <p className="text-sm text-muted-foreground px-2 py-3">Nothing logged for {first} today. When someone taps {quick[0]?.label} or {quick[3]?.label || quick[1]?.label}, it shows up here with who did it.</p>
                  : todays.map((l) => <LogRow key={l.id} entry={l} onOpen={openEntry} />)}
              </section>

              {band === 'baby' && <MilkStash person={person} logs={logs} me={me} offer={quick.some((q) => q.key === 'pumping')} onLogged={refresh} />}

              {lastTimes.length > 0 && (
                <section className="rounded-2xl border border-border/50 bg-card p-4">
                  <h2 className="font-heading text-base font-semibold mb-2 flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Last time</h2>
                  <ul className="space-y-2">
                    {lastTimes.map(([q, e]) => (
                      <li key={q.key}>
                        <button type="button" onClick={() => openEntry(e)} className="w-full flex items-center gap-3 text-left">
                          <span className="text-lg w-6 text-center">{q.icon}</span>
                          <span className="text-sm font-medium flex-1 min-w-0">{q.label}{lastDetail(e) && <span className="block text-xs text-muted-foreground font-normal truncate">{lastDetail(e)}</span>}</span>
                          <span className="text-sm text-muted-foreground text-right">{sinceText(e.timestamp)}{e.logged_by_name ? ` · ${firstName(e.logged_by_name)}` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <WeekSummary band={band} logs={logs} />

              <Trackers person={person} logs={logs} me={me} onChanged={refresh} />

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
        <Dialog open={choosing} onOpenChange={setChoosing}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buttons for {first}</DialogTitle>
              <DialogDescription>Turn off the ones your family doesn't use. Everyone sees the same buttons.</DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-border/40">
              {fitsAge.map((q) => (
                <li key={q.key} className="flex items-center gap-3 py-2">
                  <span className="text-lg w-6 text-center">{q.icon}</span>
                  <span className="text-sm flex-1">{q.label}</span>
                  <Switch checked={!hidden.includes(q.key)} onCheckedChange={(v) => setHidden(q.key, !!v)} aria-label={`Show ${q.label}`} />
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
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

// What "Last time" adds under the button's name: which side the baby nursed
// on (start on the other one), what medicine and how much (so nobody gives a
// second dose).
function lastDetail(e) {
  if (e.entry_type === 'feeding' && e.sub_type === 'nursing' && e.side) return e.side === 'both' ? 'Both sides' : `${e.side[0].toUpperCase()}${e.side.slice(1)} side`;
  if (e.entry_type === 'feeding' && e.amount) return `${e.amount} oz`;
  if (e.entry_type === 'medicine') return [e.title, e.response].filter(Boolean).join(' · ');
  if (e.entry_type === 'diaper' && e.color) return e.color.replace(/_/g, ' ');
  return '';
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

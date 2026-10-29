import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Search, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorClass } from '@/utils/memberColors';
import EntryDialog from '@/components/journal/EntryDialog';
import EntryCard from '@/components/journal/EntryCard';
import { CATEGORIES, createEntry, updateEntry, deleteEntry, groupByDay, dayLabel } from '@/lib/journal';

/**
 * The care journal: what the family noticed about the people they look after,
 * day by day. Anyone in the family can write, edit and read; each entry says
 * who wrote it and who it's about. Caregiver self check-ins live on Wellness.
 */
export default function Journal() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState({ open: false, entry: null });
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState(params.get('for') || 'all');
  const [category, setCategory] = useState('all');
  const [starred, setStarred] = useState(false);
  const queryClient = useQueryClient();
  const { me } = useFamily();

  const { data: entries = [], isLoading } = useQuery({ queryKey: ['careJournal', 'all'], queryFn: () => base44.entities.CareJournal.list('-created_date', 300) });
  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list() });

  // ?new=1 opens a fresh entry (the quick-capture button and member pages link here).
  useEffect(() => {
    if (params.get('new')) {
      setDialog({ open: true, entry: null });
      const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['careJournal'] });
  const save = useMutation({
    mutationFn: (form) => (dialog.entry?.id ? updateEntry(dialog.entry.id, form, members, me) : createEntry(form, members, me)),
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['memberJournal'] }); setDialog({ open: false, entry: null }); },
    onError: (e) => toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (entry) => deleteEntry(entry.id),
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['memberJournal'] }); setDialog({ open: false, entry: null }); },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (person === 'family' && e.family_member_id) return false;
      if (person !== 'all' && person !== 'family' && e.family_member_id !== person) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (starred && !e.is_important) return false;
      if (q && !(e.content || '').toLowerCase().includes(q) && !(e.family_member_name || '').toLowerCase().includes(q) && !(e.author_name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, person, category, starred]);
  const days = useMemo(() => groupByDay(visible), [visible]);
  const filtering = person !== 'all' || category !== 'all' || starred || search.trim();

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><BookOpen className="w-7 h-7 text-primary" /> Care Journal</h1>
          <p className="text-muted-foreground mt-1">What you noticed, what people said, the good days and the hard ones.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, entry: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">New entry</span></Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => setPerson('all')} className={chip(person === 'all')}>Everyone</button>
        {members.map((m) => (
          <button key={m.id} type="button" onClick={() => setPerson(m.id)} className={chip(person === m.id)}>
            <span className={`w-2 h-2 rounded-full ${getMemberColorClass(m, members)}`} />{m.name.split(' ')[0]}
          </button>
        ))}
        <button type="button" onClick={() => setPerson('family')} className={chip(person === 'family')}>Whole family</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search entries…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 rounded-xl h-10" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.icon} {c.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <button type="button" onClick={() => setStarred((v) => !v)} aria-pressed={starred} className={`h-10 px-3 rounded-xl border inline-flex items-center gap-1.5 text-sm ${starred ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-card border-border text-muted-foreground'}`}>
          <Star className={`w-4 h-4 ${starred ? 'fill-amber-500 text-amber-500' : ''}`} /> Important
        </button>
      </div>

      {!isLoading && days.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">{filtering ? 'Nothing matches' : 'Start the journal'}</h2>
          <p className="text-muted-foreground mb-6">{filtering ? 'Try a different person, kind or search.' : 'Write down what you noticed today. Everyone in the family can read it.'}</p>
          {!filtering && <Button onClick={() => setDialog({ open: true, entry: null })} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> New entry</Button>}
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(([day, list]) => (
            <section key={day}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{dayLabel(day)}</h2>
              <div className="space-y-3">
                {list.map((entry) => <EntryCard key={entry.id} entry={entry} members={members} onOpen={(e) => setDialog({ open: true, entry: e })} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <EntryDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        entry={dialog.entry}
        members={members}
        defaultMemberId={person !== 'all' && person !== 'family' ? person : ''}
        onSave={(form) => save.mutate(form)}
        onDelete={(e) => remove.mutate(e)}
        saving={save.isPending || remove.isPending}
      />
    </div>
  );
}

function chip(active) {
  return `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/40'}`;
}

import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileAudio, Mic, Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { GrowingInput } from '@/components/ui/growing-input';
import RecordingRow from '@/components/notes/RecordingRow';
import { usePluginPresent } from '@/components/shared/usePluginPresent';
import { useFamily } from '@/lib/family';
import { askAi } from '@/lib/aiConsent';
import { track } from '@/lib/activity';
import { isNativeApp, isAndroidApp } from '@/lib/phone';
import { listRecordings, RECORDINGS_KEY, topLevel, withFollowUpText, searchMatch, whenText } from '@/lib/recordings';

// Every recording the family made, in one place (Anna, Nov 23 2026: "it needs
// to be waaay easier to find recordings. Make a whole recordings page"). In
// the menu (Recordings), on Home, and on each person's profile
// (?for=<FamilyMember id> picks that person). A recording opens on Record
// Notes (?open=ID), whose back button comes back here.

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const monthOf = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export default function Recordings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { me, members: accounts = [] } = useFamily();
  const canRecord = usePluginPresent('RecorderBridge');
  const [search, setSearch] = useState('');
  const [asked, setAsked] = useState(null);
  const who = params.get('for') || '';

  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: RECORDINGS_KEY, queryFn: listRecordings });
  const { data: people = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list('-created_date') });

  const all = useMemo(() => topLevel(rows), [rows]);

  // The people the recordings are about, for the buttons at the top.
  const about = useMemo(() => {
    const seen = new Map();
    for (const r of all) {
      if (!r.family_member_id || seen.has(r.family_member_id)) continue;
      const p = people.find((m) => m.id === r.family_member_id);
      seen.set(r.family_member_id, firstName(p?.name || r.family_member_name));
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).filter((p) => p.name);
  }, [all, people]);

  const pick = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('for', id); else next.delete('for');
    setParams(next, { replace: true });
  };

  const q = search.trim();
  const shown = useMemo(() => all
    .filter((r) => !who || r.family_member_id === who)
    .map((r) => ({ r, m: searchMatch(withFollowUpText(r, rows), q) }))
    .filter((h) => h.m.ok), [all, rows, who, q]);

  // Newest first, under the month they were made.
  const months = useMemo(() => {
    const out = [];
    for (const h of shown) {
      const m = monthOf(h.r.started_at);
      if (!out.length || out[out.length - 1].month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(h);
    }
    return out;
  }, [shown]);

  const open = (r) => { track('action', 'recordings: opened', ''); navigate(`/notes?open=${r.id}`, { state: { from: 'recordings' } }); };

  const ask = async () => {
    if (q.length < 3 || asked?.loading) return;
    if (!(await askAi('To answer from the notes, GenCare sends your question and the notes to OpenAI.'))) return;
    setAsked({ question: q, loading: true, answer: '', sources: [] });
    track('action', 'recordings: asked', '');
    try {
      const res = await base44.functions.invoke('transcribeAudioNew', { mode: 'notes_ask', question: q });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || 'ask_failed');
      setAsked({ question: q, loading: false, answer: data.answer || '', sources: Array.isArray(data.sources) ? data.sources : [] });
    } catch {
      setAsked({ question: q, loading: false, answer: "Couldn't get an answer just now. Try again in a moment.", sources: [] });
    }
  };

  const whoName = about.find((p) => p.id === who)?.name || firstName(people.find((m) => m.id === who)?.name);
  const chip = (active) => `shrink-0 h-10 px-4 rounded-full border text-sm font-medium ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted'}`;

  return (
    <div className="pb-28 lg:pb-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><FileAudio className="w-7 h-7 text-primary" /> Recordings</h1>
          <p className="text-muted-foreground">The notes from every appointment, meeting and class the family recorded. Tap one to read it.</p>
        </div>

        {canRecord ? (
          <Link to="/notes" data-guide="recordings-record" className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl text-base font-semibold bg-red-600 hover:bg-red-700 text-white">
            <Mic className="w-5 h-5" /> Record something new
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isNativeApp() ? `To record, update GenCare from ${isAndroidApp() ? 'Google Play' : 'the App Store'}.` : 'Recording works in the GenCare app on your phone.'}
          </p>
        )}

        {all.length > 0 && (
          <div className="space-y-3" data-guide="recordings-search">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground pointer-events-none" />
                <GrowingInput value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } }}
                  placeholder="Search or ask the recordings" aria-label="Search or ask the recordings" enterKeyHint="search"
                  className="min-h-11 py-2.5 pl-9 rounded-xl border-border bg-background text-[0.9375rem] shadow-none" />
              </div>
              {q.length >= 3 && (
                <Button onClick={ask} disabled={!!asked?.loading} className="shrink-0 h-auto rounded-xl">{asked?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}</Button>
              )}
            </div>
            {(about.length > 1 || who) && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-guide="recordings-people">
                <button type="button" onClick={() => pick('')} className={chip(!who)}>Everyone</button>
                {about.map((p) => <button key={p.id} type="button" onClick={() => pick(p.id)} className={chip(who === p.id)}>{p.name}</button>)}
                {who && !about.some((p) => p.id === who) && whoName && <button type="button" className={chip(true)}>{whoName}</button>}
              </div>
            )}
          </div>
        )}

        {asked && asked.question === q && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2">
            {asked.loading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Looking through the recordings…</div>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{asked.answer}</p>
                {asked.sources.length > 0 && (
                  <div className="flex flex-col items-start gap-1">
                    {asked.sources.map((src) => (
                      <button key={src.id} type="button" onClick={() => open(src)} className="text-sm font-semibold text-primary text-left py-1">
                        From: {src.title} · {whenText(src.started_at)} ›
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="w-5 h-5 animate-spin" /> Getting the recordings…</div>
        ) : isError ? (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
            <p>The recordings didn't load. Check your connection and try again.</p>
            <Button variant="outline" onClick={() => refetch()} className="h-11">Try again</Button>
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 p-5 space-y-2">
            <p className="font-semibold">No recordings yet</p>
            <p className="text-muted-foreground">
              {canRecord
                ? <>At an appointment or a meeting, tap <b>Record something new</b>. When it's over, tap <b>Stop</b>, and the notes show up here.</>
                : <>When someone in the family records an appointment or a meeting in the GenCare app on their phone and shares it, the notes show up here.</>}
            </p>
          </div>
        ) : shown.length === 0 ? (
          q.length >= 2
            ? (asked && asked.question === q ? null : <p className="text-muted-foreground">No recording has "{q}" in it.{q.length >= 3 ? <> Tap <b>Ask</b> to ask it as a question.</> : null}</p>)
            : <p className="text-muted-foreground">No recordings about {whoName || 'them'} yet.</p>
        ) : (
          <div className="space-y-5" data-guide="recordings-list">
            {months.map(({ month, items }) => (
              <section key={month} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{month}</h2>
                {items.map(({ r, m }) => (
                  <RecordingRow key={r.id} r={r} me={me} accounts={accounts} snippet={q.length >= 2 ? m.snippet : null} onOpen={open} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, PlayCircle, Send, Sparkles, LifeBuoy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GrowingInput } from '@/components/ui/growing-input';
import SupportDialog from '@/components/shared/SupportDialog';
import { base44 } from '@/api/base44Client';
import { askAi, aiRefused, setAiConsentKnown, aiAllowedNow, onAiConsent } from '@/lib/aiConsent';
import { startGuide, guideById } from '@/components/help/guides';
import { track } from '@/lib/activity';

// "Ask a question or submit feedback" on Help (Anna, Nov 20 2026). A chat that
// answers from what GenCare's screens really say (functions/helpChat), can
// start a "Show me how" walkthrough, and, when something sounds like
// feedback, asks before sending it to the person who makes GenCare.
// The chat is kept for this visit (sessionStorage), so going off to a
// walkthrough and coming back finds it where it was.

const KEY = 'gencare_help_chat';
const REASON = 'To answer your questions, GenCare sends them to OpenAI.';
const STARTERS = ['How do I add an event?', 'How do I invite my family?', 'How do I make the words bigger?', "Something isn't working"];
const HELLO = { role: 'assistant', text: 'Hi! Ask me anything about using GenCare, like "How do I add a reminder?"\n\nYou can also tell me what isn\'t working, or what you wish GenCare did.' };

const load = () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return Array.isArray(v) && v.length ? v : [HELLO]; } catch { return [HELLO]; } };
const keep = (list) => { try { sessionStorage.setItem(KEY, JSON.stringify(list.slice(-30))); } catch { /* fine */ } };

// **bold** and line breaks, nothing else.
function Words({ text }) {
  return String(text || '').split('\n').map((line, i) => (
    <p key={i} className={line.trim() ? '' : 'h-2'}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (/^\*\*[^*]+\*\*$/.test(part) ? <b key={j}>{part.slice(2, -2)}</b> : <React.Fragment key={j}>{part}</React.Fragment>))}
    </p>
  ));
}

export default function HelpChat() {
  const [msgs, setMsgs] = useState(load);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(aiAllowedNow());
  const [writing, setWriting] = useState(false);
  const endRef = useRef(null);

  useEffect(() => keep(msgs), [msgs]);
  useEffect(() => onAiConsent((v) => setAllowed(v === 'yes')), []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' }); }, [msgs.length, busy]);

  // Asked once, as the chat opens (Apple: before anything is sent).
  useEffect(() => { askAi(REASON).then(setAllowed); }, []);

  const update = (i, patch) => setMsgs((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const ask = async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    if (!(await askAi(REASON))) { setAllowed(false); return; }
    const next = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setDraft('');
    setBusy(true);
    track('action', 'help chat: asked', '');
    try {
      const res = await base44.functions.invoke('helpChat', { messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').map(({ role, text: t }) => ({ role, text: t })) });
      const d = res?.data || res;
      if (aiRefused(d)) throw Object.assign(new Error('ai_consent'), { data: d });
      if (!d?.ok) throw new Error(d?.error || 'no answer');
      setMsgs((list) => [...list, {
        role: 'assistant', text: d.reply, guide: d.guide || '',
        feedback: d.feedback ? { kind: d.feedback_kind || 'idea', summary: d.feedback_summary || '', words: q, state: 'ask' } : null,
      }]);
    } catch (e) {
      if (aiRefused(e)) { setAiConsentKnown(''); setAllowed(false); setMsgs((list) => list.slice(0, -1)); setDraft(q); }
      else setMsgs((list) => [...list, { role: 'assistant', text: "I couldn't answer just now. Check your connection and try again.", failed: true }]);
    } finally { setBusy(false); }
  };

  const sendFeedback = async (i) => {
    const f = msgs[i]?.feedback;
    if (!f) return;
    update(i, { feedback: { ...f, state: 'sending' } });
    try {
      const message = `${f.words}\n\n(Sent from the Help chat.)`;
      await base44.functions.invoke('sendSupportRequest', { kind: f.kind === 'question' ? 'support' : f.kind, message, page: 'Help chat' });
      update(i, { feedback: { ...f, state: 'sent' } });
      track('action', 'help chat: feedback sent', f.kind);
    } catch {
      update(i, { feedback: { ...f, state: 'failed' } });
    }
  };

  const showMe = (id) => { track('action', 'help chat: show me', id); startGuide(id); };
  const startOver = () => { setMsgs([HELLO]); setDraft(''); };

  return (
    <div className="pb-28 max-w-2xl">
      <Link to="/help" className="inline-flex items-center gap-1.5 text-base font-medium text-primary mb-3 py-1"><ArrowLeft className="w-5 h-5" /> Help</Link>
      <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3 mb-1">
        <Sparkles className="w-7 h-7 text-primary" /> Ask a question
      </h1>
      <p className="text-muted-foreground mb-5 text-base">Or tell us what isn't working. Answers are written by AI from what's in GenCare.</p>

      <div className="space-y-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-base leading-relaxed space-y-1 ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border/60 rounded-bl-md'}`}>
              <Words text={m.text} />
              {m.guide && guideById(m.guide) && (
                <Button onClick={() => showMe(m.guide)} className="mt-2 h-11 gap-2 text-base w-full"><PlayCircle className="w-5 h-5" /> Show me how</Button>
              )}
              {m.feedback && (
                <div className="mt-3 rounded-xl bg-muted/70 p-3 space-y-2">
                  {m.feedback.state === 'sent' ? (
                    <p className="flex items-center gap-2 font-medium"><Check className="w-5 h-5 text-primary" /> Sent. Thank you!</p>
                  ) : m.feedback.state === 'no' ? (
                    <p className="text-muted-foreground">OK, I didn't send it.</p>
                  ) : (
                    <>
                      <p className="font-medium">{m.feedback.kind === 'question' ? 'Want me to send your question to the person who makes GenCare?' : 'Want me to send this to the person who makes GenCare?'}</p>
                      <p className="text-sm text-muted-foreground">They'll see: "{m.feedback.words}"</p>
                      {m.feedback.state === 'failed' && <p className="text-sm text-destructive">That didn't send. Check your connection and try again.</p>}
                      <div className="flex gap-2">
                        <Button variant="outline" className="h-11 flex-1 text-base" disabled={m.feedback.state === 'sending'} onClick={() => update(i, { feedback: { ...m.feedback, state: 'no' } })}>No thanks</Button>
                        <Button className="h-11 flex-1 text-base gap-2" disabled={m.feedback.state === 'sending'} onClick={() => sendFeedback(i)}>
                          {m.feedback.state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send it
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-card border border-border/60 px-4 py-3 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</div>
        )}
      </div>

      {msgs.length === 1 && allowed && (
        <div className="flex flex-wrap gap-2 mt-4">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-border bg-card px-4 py-2 text-base hover:bg-muted">{s}</button>
          ))}
        </div>
      )}

      {allowed ? (
        <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex items-end gap-2 mt-5 big-stack">
          <GrowingInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your question…" enterKeyHint="send" aria-label="Your question" maxLength={1200}
            className="flex-1 min-w-0 min-h-12 py-3 rounded-xl text-base" />
          <Button type="submit" disabled={busy || !draft.trim()} className="h-12 px-5 rounded-xl gap-2 text-base shrink-0"><Send className="w-4 h-4" /> Ask</Button>
        </form>
      ) : (
        <div className="mt-5 rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <p className="text-base">This chat uses AI from OpenAI. Without it, <b>Show me how</b> on the Help page still walks you through things, or you can write to the person who makes GenCare.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => askAi(REASON).then(setAllowed)} className="h-11 text-base gap-2"><Sparkles className="w-4 h-4" /> Use the chat</Button>
            <Button variant="outline" onClick={() => setWriting(true)} className="h-11 text-base gap-2"><LifeBuoy className="w-4 h-4" /> Send a message</Button>
          </div>
        </div>
      )}
      {msgs.length > 2 && <div className="mt-3 text-right"><button type="button" onClick={startOver} className="text-sm text-muted-foreground underline py-1">Start over</button></div>}
      <div ref={endRef} />
      <SupportDialog open={writing} kind="support" onClose={() => setWriting(false)} />
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { track } from '@/lib/activity';
import { isIPhoneApp } from '@/lib/phone';
import { saveHomeZip } from '@/lib/homeArea';
import useTypewriter from './useTypewriter';

// The first-run conversation (the same idea as ADHDone's welcome chat): a few
// short lines the app types out, each question answered in the chat. Only
// what this person is missing is asked:
//   intro  - new accounts only: a note from Anna, who made GenCare by herself
//            (Anna, Oct 29 2026: "our opening is our chance to connect, not
//            to give an overview")
//   name   - required for new accounts, unless they joined with an invite made
//            for their profile, so the family already knows who they are
//   zip    - only when they haven't given their own home ZIP; it keeps place
//            search and Resources near home (Anna, Oct 29 2026: her dad's new
//            app never asked)
//   reach  - new accounts: how to reach Anna (Settings -> Ask for help)
//   final  - "you're all set", plus the heads-up that the phone is about to
//            ask about notifications (new accounts that haven't been asked)
// Answers save as they're given, so closing halfway keeps what was said.
// The keyboard never opens by itself (Anna, Oct 29 2026): each box waits for
// a tap.

function bubble(from, text) {
  const mine = from === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
        {text}
      </div>
    </div>
  );
}

export default function WelcomeChat({ plan, home, onDone }) {
  const phone = isIPhoneApp() ? 'your iPhone' : 'your phone';

  const beats = useMemo(() => {
    const list = [];
    if (plan.fresh) {
      list.push({ id: 'hello', text: "Hi, I'm Anna. I built GenCare." });
      list.push({ id: 'intro', text: 'I made it when my family was in a time of need. Keeping appointments and everything else organized gave us more time for what mattered most: being with each other. I hope it does the same for yours.' });
    } else {
      list.push({ id: 'intro', text: 'Quick question so GenCare works better for you.' });
    }
    if (plan.needName) list.push({ id: 'name', text: plan.fresh ? "First, what should your family call you?" : 'What should your family call you?', input: 'name' });
    if (plan.needZip) {
      list.push({
        id: 'zip',
        input: 'zip',
        text: "What's your home ZIP code? When you add an address, places near you come up first, and Resources can find help nearby. GenCare never tracks where you are.",
      });
    }
    // How to reach Anna, in her words (Oct 29 2026): Settings -> Ask for help
    // (or Report a bug) goes straight to her.
    if (plan.fresh) {
      list.push({ id: 'reach', text: "If you ever need me, go to Settings and tap Ask for help or Report a bug. It's just me, so I answer quickly and make changes fast." });
    }
    let last = "You're all set!";
    if (plan.solo) last += ' Next, invite your family so everyone sees the same calendar.';
    if (plan.needNotify) last += ` ${plan.solo ? 'Then' : 'Next,'} ${phone} will ask if GenCare can send notifications, so reminders and family updates can reach you.`;
    list.push({ id: 'final', text: last, final: true });
    return list;
  }, [plan, phone]);

  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState(plan.nameGuess || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);

  const beat = beats[idx];
  const { shown, done } = useTypewriter(beat?.text || '', 18, idx);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [shown, history.length, done]);

  // Lines with nothing to answer roll on by themselves.
  useEffect(() => {
    if (!done || !beat || beat.input || beat.final) return undefined;
    const t = setTimeout(() => { setHistory((h) => [...h, { from: 'app', text: beat.text }]); setIdx((i) => i + 1); }, 700);
    return () => clearTimeout(t);
  }, [done, beat]);

  const next = (answer) => {
    setHistory((h) => [...h, { from: 'app', text: beat.text }, ...(answer ? [{ from: 'user', text: answer }] : [])]);
    setDraft(''); setErr('');
    setIdx((i) => i + 1);
  };

  const sendName = () => {
    const name = draft.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return;
    if (!plan.preview) {
      base44.auth.updateMe({ display_name: name }).catch(() => {});
      // Their own profile in the family, made for them automatically with
      // whatever the account was called (often the start of their email),
      // takes the name too.
      if (plan.selfProfileId) base44.entities.FamilyMember.update(plan.selfProfileId, { name }).catch(() => {});
    }
    track('action', 'welcome: name given');
    next(name);
  };

  const sendZip = async (zip) => {
    setBusy(true); setErr('');
    try {
      if (plan.preview && !/^\d{5}$/.test(zip)) throw new Error('A ZIP code is 5 numbers');
      const z = plan.preview ? zip : await saveHomeZip(zip);
      track('action', zip === home?.zip ? 'welcome: family ZIP kept' : 'welcome: ZIP given');
      next(z);
    } catch (e) {
      setErr(e?.message === 'A ZIP code is 5 numbers' ? 'A ZIP code is 5 numbers.' : 'Couldn\'t save that. Try again, or skip for now.');
    } finally { setBusy(false); }
  };

  const skip = (what) => { track('action', `welcome: ${what} skipped`); next(''); };

  const familyZip = home && !home.own && /^\d{5}$/.test(home.zip || '') ? home : null;
  const zipOk = /^\d{5}$/.test(draft);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center"><Heart className="w-3.5 h-3.5 text-primary-foreground" /></div>
        <span className="font-heading text-sm font-bold">GenCare</span>
      </div>

      <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        {history.map((m, i) => <React.Fragment key={i}>{bubble(m.from, m.text)}</React.Fragment>)}
        {beat && bubble('app', <>{shown}{!done && <span className="opacity-40">▍</span>}</>)}
        <div ref={endRef} />
      </div>

      {done && beat?.input === 'name' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendName()}
              placeholder="Your name" autoComplete="given-name" autoCapitalize="words" aria-label="Your name" />
            <Button onClick={sendName} disabled={!draft.trim()}>Send</Button>
          </div>
        </div>
      )}

      {done && beat?.input === 'zip' && (
        <div className="space-y-2">
          {familyZip && (
            <Button variant="outline" onClick={() => sendZip(familyZip.zip)} disabled={busy} className="w-full h-auto py-2.5 whitespace-normal">
              Same as {familyZip.from ? `${familyZip.from}'s` : "the family's"}: {familyZip.zip}
            </Button>
          )}
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))} onKeyDown={(e) => e.key === 'Enter' && zipOk && sendZip(draft)}
              inputMode="numeric" autoComplete="postal-code" placeholder={familyZip ? 'Or type a different ZIP' : 'ZIP code'} aria-label="Home ZIP code" />
            <Button onClick={() => sendZip(draft)} disabled={!zipOk || busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button variant="ghost" onClick={() => skip('ZIP')} disabled={busy} className="w-full text-xs">Skip for now</Button>
        </div>
      )}

      {done && beat?.final && (
        plan.solo ? (
          <div className="flex gap-2">
            <Button onClick={() => onDone('invite')} className="flex-1">Invite my family</Button>
            <Button variant="outline" onClick={() => onDone()} className="flex-1">Later</Button>
          </div>
        ) : (
          <Button onClick={() => onDone()} className="w-full">{plan.needNotify ? 'Okay' : "Let's go"}</Button>
        )
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, Camera, CalendarDays, MapPin, CircleHelp } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { waitForWelcome } from '@/lib/welcome';
import { tourStillToCome, TOUR_CLOSED_EVENT } from '@/components/onboarding/AppTour';
import { Switch } from '@/components/ui/switch';
import { AI_ASK_EVENT, aiConsentOf, saveAiConsent, setAiConsentKnown, aiConsentNow, onAiConsent, askAi } from '@/lib/aiConsent';

// "GenCare uses AI from OpenAI": what each feature sends, and Allow / Not now
// (Apple's App Review Guideline 5.1.2(i); Anna, Nov 20 2026). Asked once on
// its own, after the welcome chat and the tour, and again right before a
// feature that needs it, until the person allows it. Settings can change it.
// TWIN of the list in Settings (AiSetting) and the privacy policy's OpenAI part.
export const AI_USES = [
  { icon: Mic, name: 'Record Notes', sends: 'your recordings, and what you ask or change in the notes' },
  { icon: Camera, name: 'Events from a photo', sends: 'the photo' },
  { icon: CalendarDays, name: 'Calendar', sends: "events you add or bring in from your phone, and your family's names, to work out who each one is for and who sees it" },
  { icon: MapPin, name: 'Help near you', sends: 'the ZIP code you type, on the Resources page' },
  { icon: CircleHelp, name: 'Help questions', sends: 'what you ask' },
];

export function AiUseList() {
  return (
    <ul className="space-y-2.5 text-left">
      {AI_USES.map(({ icon: Icon, name, sends }) => (
        <li key={name} className="flex gap-3">
          <Icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="text-base leading-snug"><b>{name}</b>: {sends}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AiConsentDialog({ user: me }) {
  const [ask, setAsk] = useState(null); // { reason, auto }
  const [saving, setSaving] = useState(false);
  const waiting = useRef([]);

  // What the account says, and the one time it's asked on its own.
  useEffect(() => {
    if (!me?.id) return undefined;
    const c = aiConsentOf(me);
    setAiConsentKnown(c);
    if (c) return undefined;
    let live = true;
    const show = () => setTimeout(() => { if (live && !aiConsentNow()) setAsk((a) => a || { reason: '', auto: true }); }, 1200);
    if (tourStillToCome(me)) {
      window.addEventListener(TOUR_CLOSED_EVENT, show, { once: true });
      return () => { live = false; window.removeEventListener(TOUR_CLOSED_EVENT, show); };
    }
    waitForWelcome().then(show);
    return () => { live = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A feature asking first (lib/aiConsent askAi).
  useEffect(() => {
    const on = (e) => {
      if (aiConsentNow() === 'yes') { e.detail?.resolve?.(true); return; }
      waiting.current.push(e.detail?.resolve);
      setAsk((a) => (a && !a.auto ? a : { reason: e.detail?.reason || '', auto: false }));
    };
    window.addEventListener(AI_ASK_EVENT, on);
    return () => window.removeEventListener(AI_ASK_EVENT, on);
  }, []);

  const answer = async (yes) => {
    const how = ask?.auto ? 'first time' : ask?.reason?.slice(0, 80) || 'asked';
    const resolvers = waiting.current;
    waiting.current = [];
    setSaving(true);
    // "Not now" is saved only the first time, so the question isn't asked on its own again.
    try { if (yes || !aiConsentNow()) await saveAiConsent(yes, how); } catch { setAiConsentKnown(yes ? 'yes' : aiConsentNow()); }
    setSaving(false);
    setAsk(null);
    resolvers.forEach((r) => r?.(yes));
  };

  if (!ask) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) answer(false); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] rounded-2xl [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center text-center pt-1">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3"><Sparkles className="w-7 h-7 text-primary" aria-hidden="true" /></div>
          <DialogTitle className="font-heading text-2xl">GenCare uses AI from OpenAI</DialogTitle>
          <DialogDescription asChild>
            <div className="text-base leading-relaxed text-foreground/85 mt-2 space-y-3">
              {ask.reason && <p className="font-semibold text-foreground">{ask.reason}</p>}
              <p>Some features use OpenAI, an AI company, to do their work. When you use them, GenCare sends OpenAI what they need:</p>
            </div>
          </DialogDescription>
        </div>
        <AiUseList />
        <p className="text-sm text-muted-foreground">Nothing is sent until you tap <b>Allow</b>. You can change this any time in <b>Settings</b>.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1 text-base" disabled={saving} onClick={() => answer(false)}>Not now</Button>
          <Button className="h-12 flex-[2] text-base" disabled={saving} onClick={() => answer(true)}>Allow</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Settings' switch for the same thing (on = Allow). Turning it on shows the
// full question first, so the list of what's sent is always seen.
export function AiSetting() {
  const [value, setValue] = useState(aiConsentNow());
  const [showList, setShowList] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => onAiConsent(setValue), []);
  const change = async (on) => {
    setBusy(true);
    try { if (on) await askAi(''); else await saveAiConsent(false, 'settings'); } catch { /* the switch shows what's saved */ }
    setBusy(false);
  };
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-primary" /></div>
        <h2 className="flex-1 min-w-0 font-heading text-lg font-semibold"><label htmlFor="ai-features">AI features (OpenAI)</label></h2>
        <Switch id="ai-features" checked={value === 'yes'} disabled={busy} onCheckedChange={change} />
      </div>
      <p className="big-flush text-xs text-muted-foreground mt-1 pl-[3.25rem]">
        {value === 'yes' ? 'On. These features send what they need to OpenAI.' : "Off. Nothing goes to OpenAI. These features ask first when you use them."}{' '}
        <button type="button" onClick={() => setShowList((x) => !x)} className="underline">{showList ? 'Hide the list' : "What's sent?"}</button>
      </p>
      {showList && <div className="mt-3"><AiUseList /></div>}
    </div>
  );
}

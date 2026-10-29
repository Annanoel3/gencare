import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { isNativeApp } from '@/lib/phone';
import { wasAsked } from '@/lib/notifyPermission';
import { serverMs } from '@/lib/serverTime';
import { homeArea, isZip } from '@/lib/homeArea';
import { setWelcomeState } from '@/lib/welcome';
import { track } from '@/lib/activity';
import WelcomeChat from './WelcomeChat';

// Decides whether this person gets the welcome chat, and with which questions
// (WelcomeChat). Whether it's done belongs to the ACCOUNT (User.welcome_done_at),
// so a new phone or a reinstall never asks twice; this phone also remembers,
// so it doesn't flash while the account loads.
//
// New account (made in the last 3 days): the full welcome. Anyone else only
// gets asked what's missing (their own home ZIP, a real name), and nothing at
// all when nothing is.
const DONE_KEY = 'gencare_welcome_done';
// Settings (the app owner only) can show the whole chat as a new person sees
// it. Nothing typed in a preview is saved, and it doesn't count as done.
export const PREVIEW_EVENT = 'gencare-welcome-preview';
export function previewWelcome() {
  try { window.dispatchEvent(new Event(PREVIEW_EVENT)); } catch (e) { /* fine */ }
}
const NEW_ACCOUNT_DAYS = 3;

const realName = (u) => {
  const shown = String(u?.display_name || '').trim();
  if (shown) return shown;
  const full = String(u?.full_name || '').trim();
  // An email sign-up's full_name is just the start of the email address.
  return /\s/.test(full) && !full.includes('@') ? full : '';
};

// What to start the name box with: a real-looking name the account already
// has ("Jordan Reyes", or "robert" -> "Robert"); nothing for "robertv1975".
const guessName = (u) => {
  const names = [u?.display_name, u?.full_name].map((n) => String(n || '').trim());
  const full = names.find((n) => /\s/.test(n) && !n.includes('@'));
  if (full) return full;
  const one = names.find((n) => /^[a-z][a-z'-]{1,19}$/i.test(n));
  return one ? one[0].toUpperCase() + one.slice(1).toLowerCase() : '';
};

function doneHere() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
}

// `user` is the full account (auth.me): when it was made, its home ZIP.
export default function WelcomeDialog({ user: me }) {
  const { members, family, refresh } = useFamily();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [home, setHome] = useState(null);

  useEffect(() => {
    if (!me?.id) return undefined;
    if (doneHere() || me.welcome_done_at) { setWelcomeState('none'); return undefined; }
    let live = true;
    (async () => {
      const fresh = Date.now() - serverMs(me.created_date) < NEW_ACCOUNT_DAYS * 86400e3;
      // Their profile in the family. One someone else made and invited them
      // to means the family already knows who they are (Anna, Oct 29 2026: the
      // name is required unless they joined through an invite that knows them).
      let mine = null;
      try { mine = ((await base44.entities.FamilyMember.filter({ linked_user_id: me.id })) || [])[0] || null; } catch (e) { mine = null; }
      if (!live) return;
      const maker = mine ? (mine.created_by_user_id || mine.created_by_id) : '';
      const known = !!mine && !!maker && maker !== me.id && !/^self$/i.test(String(mine.relationship || ''));
      const needName = fresh ? !known : !realName(me);
      const needZip = !isZip(me.help_zip);
      if (!fresh && !needName && !needZip) {
        finish(false);
        return;
      }
      homeArea().then((h) => { if (live) setHome(h); });
      setPlan({
        fresh,
        needName,
        nameGuess: needName ? guessName(me) : '',
        selfProfileId: mine && !known ? mine.id : '',
        needZip,
        // The phone asks about notifications right after this (OneSignalInit
        // waits for it), so new accounts get told it's coming.
        needNotify: fresh && isNativeApp() && !wasAsked(),
        // Just them so far, and it's their family: point them at inviting.
        solo: fresh && family?.owner_user_id === me.id && (members || []).length <= 1,
      });
      setWelcomeState('open');
      track('action', 'welcome chat shown', fresh ? 'new account' : 'asking what was missing');
    })();
    return () => { live = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const open = () => {
      // Shows the family-ZIP button the way a new family member sees it.
      homeArea().then((h) => setHome(h?.zip ? { ...h, own: false } : null));
      setPlan({ preview: true, fresh: true, needName: true, nameGuess: '', needZip: true, needNotify: isNativeApp(), solo: false });
    };
    window.addEventListener(PREVIEW_EVENT, open);
    return () => window.removeEventListener(PREVIEW_EVENT, open);
  }, []);

  function finish(shown = true) {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* the account flag still holds */ }
    base44.auth.updateMe({ welcome_done_at: new Date().toISOString() }).catch(() => {});
    setPlan(null);
    setWelcomeState(shown ? 'done' : 'none');
  }

  const close = (then) => {
    if (plan?.preview) { setPlan(null); return; }
    finish(true);
    track('action', 'welcome chat closed', then || 'done');
    refresh?.();
    if (then === 'invite') navigate('/family?invite=1');
  };

  return (
    <Dialog open={!!plan} onOpenChange={(o) => { if (!o && plan?.preview) close(); }}>
      {/* No X: the questions each have their own way on (the name is
          required; the ZIP has Skip). The owner's preview keeps its X. */}
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl ${plan?.preview ? '' : '[&>button]:hidden'}`}
        onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (!plan?.preview) e.preventDefault(); }}>
        <DialogTitle className="sr-only">Welcome to GenCare</DialogTitle>
        <DialogDescription className="sr-only">A few quick questions to set GenCare up for you.</DialogDescription>
        <div className="pt-2">
          {plan && <WelcomeChat plan={plan} home={home} onDone={close} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
const NEW_ACCOUNT_DAYS = 3;

const realName = (u) => {
  const shown = String(u?.display_name || '').trim();
  if (shown) return shown;
  const full = String(u?.full_name || '').trim();
  // An email sign-up's full_name is just the start of the email address.
  return /\s/.test(full) && !full.includes('@') ? full : '';
};

// "robert" -> "Robert" to start the name box with; nothing for "robertv1975".
const guessName = (u) => {
  const full = String(u?.full_name || '').trim();
  return /^[a-z][a-z'-]{1,19}$/i.test(full) ? full[0].toUpperCase() + full.slice(1).toLowerCase() : '';
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
    const fresh = Date.now() - serverMs(me.created_date) < NEW_ACCOUNT_DAYS * 86400e3;
    const needName = !realName(me);
    const needZip = !isZip(me.help_zip);
    if (!fresh && !needName && !needZip) {
      finish(false);
      return undefined;
    }
    homeArea().then((h) => { if (live) setHome(h); });
    setPlan({
      fresh,
      needName,
      nameGuess: needName ? guessName(me) : '',
      needZip,
      // The phone asks about notifications right after this (OneSignalInit
      // waits for it), so new accounts get told it's coming.
      needNotify: fresh && isNativeApp() && !wasAsked(),
      // Just them so far, and it's their family: point them at inviting.
      solo: fresh && family?.owner_user_id === me.id && (members || []).length <= 1,
    });
    setWelcomeState('open');
    track('action', 'welcome chat shown', fresh ? 'new account' : 'asking what was missing');
    return () => { live = false; };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(shown = true) {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* the account flag still holds */ }
    base44.auth.updateMe({ welcome_done_at: new Date().toISOString() }).catch(() => {});
    setPlan(null);
    setWelcomeState(shown ? 'done' : 'none');
  }

  const close = (then) => {
    finish(true);
    track('action', 'welcome chat closed', then || 'done');
    refresh?.();
    if (then === 'invite') navigate('/family?invite=1');
  };

  return (
    <Dialog open={!!plan} onOpenChange={(o) => { if (!o) close('closed early'); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">Welcome to GenCare</DialogTitle>
        <DialogDescription className="sr-only">A few quick questions to set GenCare up for you.</DialogDescription>
        <div className="pt-2">
          {plan && <WelcomeChat plan={plan} home={home} onDone={close} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow } from 'date-fns';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFamily } from '@/lib/family';
import { isNativeApp, isAndroidApp } from '@/lib/phone';
import { getPlanStatus, getPlans, manageSubscriptionUrl, openInPlay, PRODUCT_YEARLY } from '@/lib/premium';

// "Your free trial ends tomorrow" (Anna, Nov 18 2026: "Make a reminder
// notification and pop up when someones free trial is about to end. So they
// can cancel if they want and not feel cheated because they forgot").
// Only for the person who started the store's free trial (only they can
// cancel it), in its last 2 days, once per trial on this phone; the push the
// day before (functions/cronReminders, 1c) opens it again with ?trial_ending=1.
// RevenueCat is asked first, so it never shows to someone who already cancelled.
// Cancel opens the store's own page: GenCare's subscription in Google Play, or
// Apple's Subscriptions list (Apple has no link to one app's subscription).
const SEEN_KEY = 'gencare_trial_notice';
const WINDOW_MS = 48 * 3600e3;
const seenFor = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const markSeen = (endsAt) => { try { localStorage.setItem(SEEN_KEY, endsAt); } catch { /* fine */ } };

export default function TrialEndingNotice() {
  const { family, me, refresh: refreshFamily } = useFamily();
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(null); // { endsAt, productId, price }
  const checking = useRef(false);
  const cancelled = useRef(false);
  const asked = new URLSearchParams(location.search).get('trial_ending') === '1';

  const check = useCallback(async (force) => {
    if (checking.current || !isNativeApp() || !family || !me) return;
    // What the family already knows: a store trial this person started, that renews, ending within 2 days.
    const endsAt = family.subscription_expires_at;
    const left = endsAt ? Date.parse(endsAt) - Date.now() : 0;
    if (family.subscription_user_id !== me.id || !family.subscription_active || !family.subscription_trial
      || !family.subscription_will_renew || !(left > 0 && left <= WINDOW_MS)) return;
    if (!force && seenFor() === endsAt) return;
    checking.current = true;
    try {
      // Ask the store (through RevenueCat) before saying anything.
      const st = await getPlanStatus({ refresh: true }).catch(() => null);
      const sub = st?.subscription;
      if (!sub?.mine || !sub.trial || !sub.will_renew || !sub.expires_at) { refreshFamily(); return; }
      const end = Date.parse(sub.expires_at) - Date.now();
      if (!(end > 0 && end <= WINDOW_MS)) return;
      const yearly = String(sub.product_id || '').startsWith(PRODUCT_YEARLY);
      // The store's own price where it can tell us; GenCare's set price otherwise.
      let price = yearly ? '$39.99' : '$5.99';
      try {
        const plans = await getPlans();
        price = (yearly ? plans.annual?.price : plans.monthly?.price) || price;
      } catch { /* keep the set price */ }
      setNotice({ endsAt: sub.expires_at, productId: sub.product_id, price: `${price} a ${yearly ? 'year' : 'month'}` });
    } finally {
      checking.current = false;
    }
  }, [family, me, refreshFamily]);

  // On open, when the family loads, and coming back to the app (it can sit in the background for days).
  useEffect(() => { check(false); }, [check]);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible') return;
      // Back from the store after Cancel: pick up the change.
      if (cancelled.current) { cancelled.current = false; getPlanStatus({ refresh: true }).catch(() => {}).finally(() => refreshFamily()); return; }
      check(false);
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [check, refreshFamily]);
  // Tapped the push: show it even if it was seen before, then tidy the address.
  useEffect(() => {
    if (!asked) return;
    check(true);
    const q = new URLSearchParams(location.search);
    q.delete('trial_ending');
    navigate({ pathname: location.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true });
  }, [asked]);

  if (!notice) return null;
  const end = new Date(notice.endsAt);
  const when = isToday(end) ? 'today' : isTomorrow(end) ? 'tomorrow' : format(end, 'EEEE');
  const store = isAndroidApp() ? 'Google Play' : 'the App Store';
  const close = () => { markSeen(notice.endsAt); setNotice(null); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogTitle className="font-heading text-xl">Your free trial ends {when}</DialogTitle>
        <DialogDescription className="text-base text-foreground/80">
          {store.charAt(0).toUpperCase() + store.slice(1)} starts charging {notice.price} for GenCare Family {when} at {format(end, 'h:mm a')}. If you'd rather not keep it, cancel before then and you won't be charged.
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full h-11" onClick={close}>Keep GenCare</Button>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => { cancelled.current = true; openInPlay(manageSubscriptionUrl(notice.productId)); close(); }}
          >
            Cancel in {store}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

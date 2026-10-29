import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Check, Loader2, Users, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { base44 } from '@/api/base44Client';
import { isNativeApp, isAndroidApp , externalClick } from '@/lib/phone';
import {
  billingAvailable, getPlans, buyPlan, restorePurchases, getPlanStatus,
  manageSubscriptionUrl, openInPlay, PRICE_MONTHLY_TEXT, PRICE_YEARLY_TEXT, PLAY_STORE_URL,
} from '@/lib/premium';

const PERKS = [
  'The whole family on one calendar, with everyone’s phone kept in step',
  'Push notifications when someone adds or changes an appointment',
  'Record notes at appointments and meetings — organized notes plus the full transcript',
  'Reminders, care logs, checklists and messages, shared with everyone who helps',
  'One subscription covers every member of the family',
];

// The paywall and the plan screen. Shown on its own when the family has no
// access (FamilyGate), and from Settings while it does.
//
// Free week (Anna, Oct 29 2026): the usual store trial. Both plans carry a
// 1-week free introductory offer in the App Store (and Google Play once its
// plans exist), so "Start free week" goes through Apple/Google, who charge
// after 7 days unless the person cancels. New iPhone families start here.
// Android and web families made before Google billing is live still get
// GenCare's own free week (access.reason 'trial').
const hasTrial = (p) => !!p?.freeTrial; // true (iOS) or "P1W" (Android)
export default function Subscribe({ gate = false }) {
  const { family, access, members, refresh } = useFamily();
  const [plans, setPlans] = useState(null);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await getPlanStatus().catch(() => null);
      if (!cancelled && st?.ok) setStatus(st);
      const b = await billingAvailable();
      if (cancelled) return;
      setBilling(b);
      if (b.available) {
        try { setPlans(await getPlans()); } catch (e) { setPlans({ error: e?.message || 'Could not load the plans' }); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const buy = async (pkg) => {
    if (!pkg) return;
    setBusy(pkg.id);
    try {
      const r = await buyPlan(pkg.id);
      if (r.cancelled) return;
      if (r.pending) { toast({ title: 'Payment pending', description: `${isAndroidApp() ? 'Google Play' : 'The App Store'} is still confirming it. The plan switches on as soon as it goes through.` }); return; }
      if (r.active) {
        const s = r.status?.subscription;
        toast(s?.trial
          ? { title: 'Your free week has started', description: `Everyone in ${family?.name || 'your family'} is covered.${s.expires_at ? ` Nothing is charged until ${new Date(s.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.` : ''}` }
          : { title: 'Welcome to GenCare Family', description: `Everyone in ${family?.name || 'your family'} is covered.` });
        await refresh();
      } else {
        toast({ title: 'Almost there', description: 'The purchase went through; the plan switches on in a moment.' });
      }
    } catch (e) {
      toast({ title: 'Purchase did not go through', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const r = await restorePurchases();
      if (r.active) { toast({ title: 'Subscription restored' }); await refresh(); }
      else toast({ title: 'Nothing to restore', description: `No active GenCare subscription on this ${isAndroidApp() ? 'Google' : 'Apple'} account.` });
    } catch (e) {
      toast({ title: 'Could not restore', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const sub = status?.subscription;
  const trialLeft = access?.reason === 'trial' && access?.until ? Math.max(0, Math.ceil((Date.parse(access.until) - Date.now()) / 86400e3)) : null;
  const anyTrial = hasTrial(plans?.annual) || hasTrial(plans?.monthly);
  const storeName = isAndroidApp() ? 'Google Play' : 'the App Store';
  const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className={`${gate ? 'min-h-screen bg-background flex items-center justify-center p-4' : 'pb-24 lg:pb-8'}`}>
      <div className="w-full max-w-lg mx-auto">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Heart className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold">GenCare Family</h1>
          {access?.reason === 'subscribed' && sub?.trial ? (
            <p className="text-sm text-muted-foreground">Free week{sub.expires_at ? ` until ${shortDate(sub.expires_at)}` : ''}. {sub.will_renew ? `After that the plan starts, unless it's cancelled in ${storeName}.` : 'It won’t renew after that.'}</p>
          ) : access?.reason === 'subscribed' ? (
            <p className="text-sm text-muted-foreground">Your family is covered{sub?.expires_at ? ` through ${new Date(sub.expires_at).toLocaleDateString()}` : ''}{sub && !sub.will_renew ? ' (not renewing)' : ''}.</p>
          ) : access?.reason === 'trial' ? (
            <p className="text-sm text-muted-foreground">{trialLeft} day{trialLeft === 1 ? '' : 's'} left on your free trial.</p>
          ) : gate && access?.reason === 'trial_over' ? (
            <p className="text-sm text-muted-foreground">Your free trial is over. Keep {family?.name || 'your family'} going with one plan for everyone.</p>
          ) : gate ? (
            <p className="text-sm text-muted-foreground">Try it free for a week. One plan covers everyone in {family?.name || 'your family'}.</p>
          ) : (
            <p className="text-sm text-muted-foreground">One plan for everyone in {family?.name || 'your family'}.</p>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-5">
          <ul className="space-y-2">
            {PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /> <span>{p}</span></li>
            ))}
          </ul>

          {access?.reason === 'subscribed' ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted p-3 text-sm flex items-center gap-2"><Users className="w-4 h-4" /> {members.length} member{members.length === 1 ? '' : 's'} covered{sub?.mine ? ' by your subscription' : sub ? ' by another member’s subscription' : ''}.</div>
              {sub?.mine && isNativeApp() && (
                <Button variant="outline" className="w-full gap-2" onClick={() => openInPlay(manageSubscriptionUrl(sub.product_id))}><ExternalLink className="w-4 h-4" /> {isAndroidApp() ? 'Manage in Google Play' : 'Manage in the App Store'}</Button>
              )}
            </div>
          ) : !isNativeApp() ? (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Subscribe from the GenCare app on your phone. One person subscribing covers the whole family.
               <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" onClick={externalClick(PLAY_STORE_URL)} className="block mt-2 text-primary underline">Get GenCare on Google Play</a>
            </div>
          ) : billing && !billing.available ? (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {billing.reason === 'update_needed' ? `Update GenCare from ${isAndroidApp() ? 'Google Play' : 'the App Store'} to subscribe.` : 'Subscriptions aren’t switched on in this build yet.'}
            </div>
          ) : plans?.error ? (
            <p className="text-sm text-destructive">{plans.error}</p>
          ) : !plans ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {anyTrial && <p className="text-sm font-medium text-center">Pick a plan to start your free week. Nothing is charged today.</p>}
              {plans.annual && (
                <button type="button" onClick={() => buy(plans.annual)} disabled={!!busy} className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Yearly</p>
                      <p className="text-xs text-muted-foreground">{hasTrial(plans.annual) ? `First week free, then ${plans.annual.price} a year` : 'Best value'}</p>
                    </div>
                    <p className="font-bold">{busy === plans.annual.id ? <Loader2 className="w-4 h-4 animate-spin" /> : plans.annual.price}</p>
                  </div>
                </button>
              )}
              {plans.monthly && (
                <button type="button" onClick={() => buy(plans.monthly)} disabled={!!busy} className="w-full rounded-xl border border-border p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Monthly</p>
                      <p className="text-xs text-muted-foreground">{hasTrial(plans.monthly) ? `First week free, then ${plans.monthly.price} a month` : 'Cancel any time'}</p>
                    </div>
                    <p className="font-bold">{busy === plans.monthly.id ? <Loader2 className="w-4 h-4 animate-spin" /> : plans.monthly.price}</p>
                  </div>
                </button>
              )}
              {!plans.monthly && !plans.annual && (
                <p className="text-sm text-muted-foreground">Plans aren’t set up in {isAndroidApp() ? 'Google Play' : 'the App Store'} yet ({PRICE_MONTHLY_TEXT} or {PRICE_YEARLY_TEXT}).</p>
              )}
              <button type="button" onClick={restore} disabled={!!busy} className="w-full text-xs text-muted-foreground underline py-1">
                {busy === 'restore' ? 'Restoring…' : 'Already subscribed? Restore purchase'}
              </button>
              {/* What Apple (3.1.2) and Google ask a subscription screen to say. */}
              <p className="text-[11px] leading-snug text-muted-foreground text-center">
                {anyTrial ? 'New subscribers get the first week free; cancel before it ends and nothing is charged. After that, the' : 'The'} Family plan renews automatically at the price shown (monthly or yearly) until you cancel. Payment is charged to your {isAndroidApp() ? 'Google Play account' : 'Apple Account'}. Cancel any time in {isAndroidApp() ? 'Google Play' : 'your App Store'} subscriptions, at least 24 hours before {anyTrial ? 'the free week ends or the plan renews' : 'it renews'}.{' '}
                <Link to="/terms" className="underline">Terms of Use</Link> · <Link to="/privacy-policy" className="underline">Privacy Policy</Link>
              </p>
            </div>
          )}
        </div>

        {gate && access?.reason === 'trial_over' && (
          <p className="text-xs text-center text-muted-foreground mt-4">
            Nothing is deleted. Your family’s calendar, notes and logs are all here when you come back.
          </p>
        )}
        {/* The paywall covers the app, but the account stays reachable (Apple
            5.1.1(v): deleting the account is always possible). */}
        {gate && (
          <p className="text-xs text-center text-muted-foreground mt-4 space-x-3">
            <Link to="/account-management" className="underline">Account settings</Link>
            <button type="button" onClick={() => base44.auth.logout()} className="underline">Sign out</button>
          </p>
        )}
      </div>
    </div>
  );
}

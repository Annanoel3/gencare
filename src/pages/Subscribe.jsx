import React, { useEffect, useState } from 'react';
import { Heart, Check, Loader2, Users, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { isNativeApp, isAndroidApp } from '@/lib/phone';
import {
  billingAvailable, getPlans, buyPlan, restorePurchases, getPlanStatus,
  manageSubscriptionUrl, openInPlay, PRICE_MONTHLY_TEXT, PRICE_YEARLY_TEXT, PLAY_STORE_URL,
} from '@/lib/premium';

const PERKS = [
  'The whole family on one calendar, with everyone’s phone kept in step',
  'Push notifications when someone adds or changes an appointment',
  'Record notes at doctor visits and meetings — organized notes plus the full transcript',
  'Medications, care logs, checklists and messages, shared with everyone who helps',
  'One subscription covers every member of the family',
];

// The paywall and the plan screen. Shown on its own when the trial is over
// (FamilyGate), and from Settings while the family still has access.
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
      if (r.pending) { toast({ title: 'Payment pending', description: 'Google Play is still confirming it. The plan switches on as soon as it goes through.' }); return; }
      if (r.active) {
        toast({ title: 'Welcome to GenCare Family', description: `Everyone in ${family?.name || 'your family'} is covered.` });
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
      else toast({ title: 'Nothing to restore', description: 'No active GenCare subscription on this Google account.' });
    } catch (e) {
      toast({ title: 'Could not restore', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const sub = status?.subscription;
  const trialLeft = access?.reason === 'trial' && access?.until ? Math.max(0, Math.ceil((Date.parse(access.until) - Date.now()) / 86400e3)) : null;

  return (
    <div className={`${gate ? 'min-h-screen bg-background flex items-center justify-center p-4' : 'pb-24 lg:pb-8'}`}>
      <div className="w-full max-w-lg mx-auto">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Heart className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold">GenCare Family</h1>
          {access?.reason === 'subscribed' ? (
            <p className="text-sm text-muted-foreground">Your family is covered{sub?.expires_at ? ` through ${new Date(sub.expires_at).toLocaleDateString()}` : ''}{sub && !sub.will_renew ? ' (not renewing)' : ''}.</p>
          ) : access?.reason === 'trial' ? (
            <p className="text-sm text-muted-foreground">{trialLeft} day{trialLeft === 1 ? '' : 's'} left on your free week.</p>
          ) : gate ? (
            <p className="text-sm text-muted-foreground">Your free week is over. Keep {family?.name || 'your family'} going with one plan for everyone.</p>
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
              {sub?.mine && isAndroidApp() && (
                <Button variant="outline" className="w-full gap-2" onClick={() => openInPlay(manageSubscriptionUrl(sub.product_id))}><ExternalLink className="w-4 h-4" /> Manage in Google Play</Button>
              )}
            </div>
          ) : !isNativeApp() ? (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Subscribe from the GenCare app on your phone. One person subscribing covers the whole family.
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="block mt-2 text-primary underline">Get GenCare on Google Play</a>
            </div>
          ) : billing && !billing.available ? (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {billing.reason === 'update_needed' ? 'Update GenCare from Google Play to subscribe.' : 'Subscriptions aren’t switched on in this build yet.'}
            </div>
          ) : plans?.error ? (
            <p className="text-sm text-destructive">{plans.error}</p>
          ) : !plans ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {plans.annual && (
                <button type="button" onClick={() => buy(plans.annual)} disabled={!!busy} className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Yearly</p>
                      <p className="text-xs text-muted-foreground">Best value{plans.annual.freeTrial ? ' · free trial first' : ''}</p>
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
                      <p className="text-xs text-muted-foreground">Cancel any time{plans.monthly.freeTrial ? ' · free trial first' : ''}</p>
                    </div>
                    <p className="font-bold">{busy === plans.monthly.id ? <Loader2 className="w-4 h-4 animate-spin" /> : plans.monthly.price}</p>
                  </div>
                </button>
              )}
              {!plans.monthly && !plans.annual && (
                <p className="text-sm text-muted-foreground">Plans aren’t set up in Google Play yet ({PRICE_MONTHLY_TEXT} or {PRICE_YEARLY_TEXT}).</p>
              )}
              <button type="button" onClick={restore} disabled={!!busy} className="w-full text-xs text-muted-foreground underline py-1">
                {busy === 'restore' ? 'Restoring…' : 'Already subscribed? Restore purchase'}
              </button>
            </div>
          )}
        </div>

        {gate && (
          <p className="text-xs text-center text-muted-foreground mt-4">
            Nothing is deleted. Your family’s calendar, notes and logs are all here when you come back.
          </p>
        )}
      </div>
    </div>
  );
}

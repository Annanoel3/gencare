// Does this family have the app right now? A family has access while its
// free trial runs (7 days, or 30 on Android for now; see functions/family),
// while a member's subscription is active (functions/premium keeps that in step
// with RevenueCat), or while promo_until (free access given
// by hand) is in the future. The app owner always has access.
export function accessOf(family: any, user: any) {
  const now = Date.now();
  if (user?.role === 'admin') return { access: true, reason: 'owner', trial_ends_at: family?.trial_ends_at || null };
  if (!family) return { access: false, reason: 'no_family', trial_ends_at: null };
  const promo = family.promo_until ? Date.parse(family.promo_until) : 0;
  if (promo && promo > now) return { access: true, reason: 'promo', until: family.promo_until, trial_ends_at: family.trial_ends_at || null };
  const exp = family.subscription_expires_at ? Date.parse(family.subscription_expires_at) : 0;
  if (family.subscription_active && (!exp || exp > now)) {
    return { access: true, reason: 'subscribed', until: family.subscription_expires_at || null, will_renew: !!family.subscription_will_renew, trial_ends_at: family.trial_ends_at || null };
  }
  const trial = family.trial_ends_at ? Date.parse(family.trial_ends_at) : 0;
  if (trial && trial > now) return { access: true, reason: 'trial', until: family.trial_ends_at, trial_ends_at: family.trial_ends_at };
  return { access: false, reason: trial ? 'trial_over' : 'no_plan', trial_ends_at: family.trial_ends_at || null };
}

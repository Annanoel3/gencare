// What RevenueCat (the source of truth for Google Play / App Store
// subscriptions) says about one person: their best active entitlement, when it
// ends, whether it renews, and whether it's still in the store's free trial.
// Used by functions/premium and functions/cronReminders (the trial-ending warning).
// RevenueCat app user id = Base44 user id.
export async function fetchRevenueCat(appUserId: string) {
  const key = (Deno.env.get('REVENUECAT_SECRET_KEY') || '').trim();
  if (!key) return { configured: false as const };
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const sub = j?.subscriber || {};
  const now = Date.now();
  let best: any = null;
  for (const [id, e] of Object.entries<any>(sub.entitlements || {})) {
    const exp = e?.expires_date ? Date.parse(e.expires_date) : null;
    const grace = e?.grace_period_expires_date ? Date.parse(e.grace_period_expires_date) : null;
    const active = exp === null || exp > now || (grace !== null && grace > now);
    if (active && (!best || (exp ?? Infinity) > (best.exp ?? Infinity))) best = { id, exp, grace, product: e.product_identifier };
  }
  const s = best ? (sub.subscriptions || {})[best.product] || {} : {};
  return {
    configured: true as const,
    active: !!best,
    entitlement: best?.id || null,
    product_id: best?.product || null,
    expires_at: best ? (best.exp === null ? null : new Date(Math.max(best.exp, best.grace ?? 0)).toISOString()) : null,
    will_renew: best ? !s.unsubscribe_detected_at && !s.billing_issues_detected_at : false,
    store: s.store || null,
    sandbox: !!s.is_sandbox,
    trial: s.period_type === 'trial',
  };
}

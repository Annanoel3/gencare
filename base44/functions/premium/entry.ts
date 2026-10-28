import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { accessOf } from '../../shared/access.ts';

// The GenCare Family plan: free for 7 days from when the family was made,
// then a subscription (Google Play / App Store through RevenueCat) that ONE
// member buys and the whole family shares. Ported from Happy Plants'
// functions/premium, scoped to the family instead of the person.
//
//   { action: "status" }  -> { access, plan, subscription }   (asks RevenueCat
//                           only when a saved subscription is near its end)
//   { action: "refresh" } -> asks RevenueCat (source of truth) for the caller
//                           and saves what it says on the family. Called right
//                           after a purchase or Restore, since webhooks lag.
//   RevenueCat webhook (Integrations -> Webhooks -> this function's URL):
//        { event: {...} } -> re-reads the subscriber it names. Nothing in the
//        body is trusted beyond WHO to re-read, so no shared secret is needed.
// RevenueCat app user id = Base44 user id. Access rules: shared/access.ts.

const PRODUCT_IDS = ['gencare_family_monthly', 'gencare_family_yearly'];
const isBase44Id = (id: unknown) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

async function fetchRevenueCat(appUserId: string) {
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

// RevenueCat Test Store purchases cost nothing: only Anna's own accounts count them.
const TEST_STORE_ACCOUNTS = ['annanoelwenballew@gmail.com', 's2kap2chick@gmail.com', 'annanoelwenballew@outlook.com'];
const mayUseTestStore = (email: unknown) => TEST_STORE_ACCOUNTS.includes(String(email || '').toLowerCase());

// What RevenueCat says about this person, written onto their family.
async function applyToFamily(db: any, user: any, info: any, event: string) {
  const family = (await db.Family.filter({ id: user.family_id }))?.[0];
  if (!family) return null;
  if (info.store && /test/i.test(String(info.store)) && !mayUseTestStore(user.email)) info = { ...info, active: false };
  // Another member's subscription already covers the family and is still good:
  // a "not subscribed" answer about THIS person doesn't switch it off.
  if (!info.active && family.subscription_active && family.subscription_user_id && family.subscription_user_id !== user.id
      && (!family.subscription_expires_at || Date.parse(family.subscription_expires_at) > Date.now())) {
    return family;
  }
  const patch = info.active ? {
    subscription_active: true,
    subscription_user_id: user.id,
    subscription_product_id: info.product_id,
    subscription_expires_at: info.expires_at,
    subscription_will_renew: !!info.will_renew,
    subscription_store: info.store,
    subscription_sandbox: !!info.sandbox,
    subscription_synced_at: new Date().toISOString(),
    subscription_last_event: event,
  } : (family.subscription_user_id === user.id || !family.subscription_user_id) ? {
    subscription_active: false,
    subscription_will_renew: false,
    subscription_synced_at: new Date().toISOString(),
    subscription_last_event: event,
  } : null;
  if (patch) await db.Family.update(family.id, patch);
  return { ...family, ...(patch || {}) };
}

const RECHECK_WITHIN_MS = 3 * 3600e3;
const RECHECK_EVERY_MS = 15 * 60e3;
function shouldRecheck(family: any): boolean {
  if (!family?.subscription_active || !family.subscription_expires_at) return false;
  const exp = Date.parse(family.subscription_expires_at);
  if (!Number.isFinite(exp) || exp - Date.now() > RECHECK_WITHIN_MS) return false;
  const last = Date.parse(family.subscription_synced_at || '') || 0;
  return Date.now() - last > RECHECK_EVERY_MS;
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  // RevenueCat webhook
  if (body?.event && typeof body.event === 'object') {
    const ev = body.event;
    if (ev.type === 'TEST') return Response.json({ ok: true, test: true });
    const list = (v: any) => (Array.isArray(v) ? v : []);
    const ids = [...new Set([ev.app_user_id, ev.original_app_user_id, ...list(ev.aliases), ...list(ev.transferred_from), ...list(ev.transferred_to)].filter(isBase44Id))].slice(0, 10) as string[];
    if (!ids.length) return Response.json({ ok: true, ignored: 'no_user' });
    try {
      let synced = 0;
      for (const id of ids) {
        const u = (await db.User.filter({ id }))?.[0];
        if (!u?.family_id) continue;
        const info = await fetchRevenueCat(id);
        if (!info.configured) break;
        await applyToFamily(db, u, info, `webhook:${ev.type}`);
        synced++;
      }
      return Response.json({ ok: true, synced, type: ev.type });
    } catch (e) {
      console.error('[premium] webhook', (e as Error).message);
      return Response.json({ ok: false, error: 'sync_failed' }, { status: 500 });
    }
  }

  // The app
  let me: any = null;
  try { me = await base44.auth.me(); } catch (_) { me = null; }
  if (!me?.id) return Response.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  const user = (await db.User.filter({ id: me.id }))?.[0] || me;
  if (!user.family_id) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });
  let family = (await db.Family.filter({ id: user.family_id }))?.[0];
  if (!family) return Response.json({ ok: false, error: 'No family yet' }, { status: 400 });
  const rcConfigured = !!(Deno.env.get('REVENUECAT_SECRET_KEY') || '').trim();
  let refreshed = false;

  try {
    if (body.action === 'refresh') {
      const info = await fetchRevenueCat(user.id);
      if (info.configured) { family = await applyToFamily(db, user, info, 'app_refresh') || family; refreshed = true; }
    } else if (rcConfigured && shouldRecheck(family) && family.subscription_user_id) {
      try {
        const payer = (await db.User.filter({ id: family.subscription_user_id }))?.[0];
        if (payer) {
          const info = await fetchRevenueCat(payer.id);
          if (info.configured) { family = await applyToFamily(db, payer, info, 'renewal_check') || family; refreshed = true; }
        }
      } catch (e) { console.warn('[premium] renewal check', (e as Error).message); }
    }
  } catch (e) {
    console.warn('[premium]', (e as Error).message);
  }

  const access = accessOf(family, user);
  return Response.json({
    ok: true,
    access,
    refreshed,
    rc_configured: rcConfigured,
    products: PRODUCT_IDS,
    family: { id: family.id, name: family.name, trial_ends_at: family.trial_ends_at },
    subscription: family.subscription_active ? {
      user_id: family.subscription_user_id,
      mine: family.subscription_user_id === user.id,
      product_id: family.subscription_product_id,
      expires_at: family.subscription_expires_at,
      will_renew: !!family.subscription_will_renew,
      store: family.subscription_store,
      sandbox: !!family.subscription_sandbox,
    } : null,
  });
});

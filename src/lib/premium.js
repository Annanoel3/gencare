import { base44 } from '@/api/base44Client';
import { isNativeApp, isAndroidApp, plugin } from '@/lib/phone';

// The GenCare Family plan: 7 free days per family, then a subscription one
// member buys for everyone. The server (functions/premium, fed by RevenueCat)
// decides whether the family has access; the phone only starts purchases.
// App user id at RevenueCat = Base44 user id. Same shape as Happy Plants' premium.js.

export const PRODUCT_MONTHLY = 'gencare_family_monthly';
export const PRODUCT_YEARLY = 'gencare_family_yearly';
export const PRICE_MONTHLY_TEXT = '$5.99 / month';
export const PRICE_YEARLY_TEXT = '$39.99 / year';

const bridge = () => (isNativeApp() ? plugin('BillingBridge') : null);
let configuredFor = null;

export async function getPlanStatus({ refresh = false } = {}) {
  const res = await base44.functions.invoke('premium', { action: refresh ? 'refresh' : 'status' });
  const data = res?.data || res;
  if (data?.ok) {
    try { window.dispatchEvent(new CustomEvent('gencare-plan', { detail: data })); } catch (e) { /* fine */ }
  }
  return data;
}

export async function billingAvailable() {
  const b = bridge();
  if (!b) return { available: false, reason: 'web' };
  try {
    const r = await b.isAvailable();
    return r?.available ? { available: true, testStore: !!r.testStore } : { available: false, reason: 'no_key' };
  } catch (e) {
    return { available: false, reason: 'update_needed' };
  }
}

async function ensureConfigured() {
  const b = bridge();
  if (!b) throw new Error('billing_unavailable');
  const user = await base44.auth.me();
  if (!user?.id) throw new Error('not_signed_in');
  if (configuredFor !== user.id) {
    await b.configure({ appUserId: user.id });
    configuredFor = user.id;
  }
  return b;
}

// { monthly, annual, all } with Google Play's own price text (and the free trial, if the product has one).
export async function getPlans() {
  const b = await ensureConfigured();
  const r = await b.getOfferings();
  const pkgs = r?.packages || [];
  const monthly = pkgs.find((p) => p.productId?.startsWith(PRODUCT_MONTHLY)) || pkgs.find((p) => p.type === 'MONTHLY') || pkgs.find((p) => p.period === 'P1M');
  const annual = pkgs.find((p) => p.productId?.startsWith(PRODUCT_YEARLY)) || pkgs.find((p) => p.type === 'ANNUAL') || pkgs.find((p) => p.period === 'P1Y');
  return { monthly, annual, all: pkgs };
}

let soonTimer = null;
function checkSoon() {
  clearTimeout(soonTimer);
  soonTimer = setTimeout(() => { getPlanStatus({ refresh: true }).catch(() => {}); }, 120000);
}

// { cancelled } | { pending } | { active, status }
export async function buyPlan(packageId) {
  const b = await ensureConfigured();
  let r;
  try {
    r = await b.purchase({ packageId });
  } catch (e) {
    checkSoon();
    throw e;
  }
  if (r?.cancelled) return { cancelled: true };
  if (r?.pending) { checkSoon(); return { pending: true }; }
  const status = await getPlanStatus({ refresh: true }).catch(() => null);
  const active = !!(status?.access?.access && status?.access?.reason === 'subscribed') || !!r?.active;
  if (!active) checkSoon();
  return { active, status };
}

export async function restorePurchases() {
  const b = await ensureConfigured();
  await b.restore();
  const status = await getPlanStatus({ refresh: true }).catch(() => null);
  return { active: !!(status?.access?.access && status?.access?.reason === 'subscribed'), status };
}

const APP_PACKAGE = 'com.mediocreatbest.gencare';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;

export function manageSubscriptionUrl(productId) {
  const base = 'https://play.google.com/store/account/subscriptions';
  return productId ? `${base}?sku=${encodeURIComponent(productId.split(':')[0])}&package=${APP_PACKAGE}` : `${base}?package=${APP_PACKAGE}`;
}

// Google Play links from the Android app have to go through an intent: pinned to the
// Play Store app; a plain https link would load Google's website inside the app.
function playIntent(httpsUrl) {
  return `intent://${httpsUrl.replace(/^https:\/\//, '')}#Intent;scheme=https;package=com.android.vending;end`;
}
export function openInPlay(httpsUrl) {
  if (isAndroidApp()) window.location.href = playIntent(httpsUrl);
  else window.open(httpsUrl, '_blank', 'noopener');
}

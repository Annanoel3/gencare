import { base44 } from '@/api/base44Client';
import { isNativeApp, plugin, waitForPlugin } from '@/lib/phone';
import { track } from '@/lib/activity';
import { appParams } from '@/lib/app-params';

// GenCare's home-screen widgets: Day, Week and Month, on Android and iPhone
// (Anna, Oct 30 2026). They refresh on their own with the app closed, from
// functions/widgetFeed, using a read-only key this phone gets once (stored by
// the native WidgetBridge, never in the web app). The web app only:
//   - gets this phone its key when it doesn't have one for this account
//   - asks the widgets to refresh after the calendar changes here
//   - drops the key when the person signs out on this phone
// Builds before the widgets have no WidgetBridge; all of this then does nothing.

const bridge = () => plugin('WidgetBridge');

// Where the widgets ask: this app on this server (the app calls /api/... on its own origin).
const session = () => ({ appId: appParams.appId || '', serverUrl: window.location.origin });

let setupFor = '';
export async function setupWidgets(me) {
  if (!isNativeApp() || !me?.id || setupFor === me.id) return;
  setupFor = me.id;
  const B = bridge() || await waitForPlugin('WidgetBridge', 8000);
  if (!B?.status) return;
  try {
    const s = await B.status();
    if (s?.hasKey && s.userId === me.id) { B.reload?.(); return; }
    // No key yet, or one for someone who signed out here before.
    if (s?.hasKey) await forgetKey(B);
    const res = await base44.functions.invoke('widgetFeed', { mode: 'key' });
    const key = (res?.data || res)?.key;
    if (!key) throw new Error('no key');
    const { appId, serverUrl } = session();
    await B.setKey({ key, userId: me.id, appId, serverUrl });
    track('action', 'widgets: key set');
  } catch (e) {
    setupFor = '';
    track('error', 'widgets: setup', String(e?.message || e));
  }
}

// After an event changes here: the widgets show it now, not at their next
// refresh. Several changes in a row refresh once.
let timer = null;
export function reloadWidgets() {
  if (!isNativeApp()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { try { bridge()?.reload?.(); } catch (e) { /* older build */ } }, 2500);
}

async function forgetKey(B) {
  const old = await B.clear?.();
  if (old?.key) await base44.functions.invoke('widgetFeed', { mode: 'forget', key: old.key }).catch(() => {});
}

/** Sign out: this phone's widgets stop showing the calendar, then the account signs out. */
export async function signOut(redirect) {
  try {
    const B = bridge();
    if (B?.clear) await Promise.race([forgetKey(B), new Promise((r) => setTimeout(r, 3000))]);
  } catch (e) { /* signing out matters more */ }
  setupFor = '';
  return redirect ? base44.auth.logout(redirect) : base44.auth.logout();
}

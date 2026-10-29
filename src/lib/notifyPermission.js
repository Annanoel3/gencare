// Keeps the "Notifications are off" banner honest.
//
// On a phone the app asks for notification permission once it knows who is
// signed in (OneSignalInit). Until that question has been answered, "not
// allowed" only means "not asked yet", so the banner stays hidden. When the
// answer comes back, OneSignalInit calls markPermissionAnswered(), which
// remembers that the person has been asked and tells the banner to check again
// right away (no waiting for the app to be reopened).

export const ASKED_KEY = 'gencare_notif_permission_asked';
const EVENT = 'gencare-notif-permission';

export function wasAsked() {
  try { return localStorage.getItem(ASKED_KEY) === '1'; } catch (e) { return false; }
}

export function markPermissionAnswered(granted) {
  try { localStorage.setItem(ASKED_KEY, '1'); } catch (e) { /* fine */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { granted: granted === true } })); } catch (e) { /* fine */ }
}

/** Calls `fn` whenever the permission question gets answered. Returns an unsubscribe. */
export function onPermissionAnswered(fn) {
  const h = (e) => fn(e?.detail || {});
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

import { useEffect, useRef } from 'react';
import { track } from '@/lib/activity';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isNativeApp, waitForPlugin } from '@/lib/phone';
import { markPermissionAnswered } from '@/lib/notifyPermission';
import { waitForWelcome } from '@/lib/welcome';

// Push notifications, ported from ADHDone's OneSignalInit.
//   - In the Android/iPhone app: the native OneSignal SDK through NotifyBridge
//     (login with the person's email as external id, which is what every push
//     from the server targets — see base44/shared/push.ts).
//   - In a browser: OneSignal's web SDK.
// A tap on a push lands on the screen the push names (data.screen), with the
// calendar opened on the event's day.

// GenCare's OneSignal app (dashboard.onesignal.com -> GenCare -> Keys & IDs).
// 067a47c8-... was FitAbility's id, pasted here by mistake on June 9 2026.
const ONESIGNAL_APP_ID = '41013e11-10b9-45c1-a24f-11c47b3b2534';

async function savePlayerId(playerId) {
  if (!playerId) return;
  try {
    await base44.functions.invoke('saveMyPlayerId', { playerId });
  } catch (err) {
    console.warn('[OneSignal] could not save player id:', err?.message || err);
  }
}

function handleNotificationData(data, navigate) {
  if (!data) return;
  let target = data.screen || '/';
  if ((data.type === 'appointment' || data.type === 'appointment_reminder' || (data.type === 'claim' && data.appointmentId)) && data.date) {
    // That day on the calendar, the event glowing, not its edit popup (Anna, Oct 30 2026).
    target = `/calendar?date=${encodeURIComponent(data.date)}${data.appointmentId ? `&event=${encodeURIComponent(data.appointmentId)}` : ''}`;
  } else if (data.reminderId && (/^reminder_/.test(String(data.type || '')) || data.type === 'claim')) {
    // The reminder on To-do, glowing, not its edit popup (Anna, Oct 31 2026),
    // including pushes sent before this changed (their screen opened the editor).
    target = `/tasks?highlight=${encodeURIComponent(data.reminderId)}`;
  } else if (data.type === 'task' || data.type === 'task_due') {
    target = `/tasks${data.taskId ? `?highlight=${encodeURIComponent(data.taskId)}` : ''}`;
  } else if (data.type === 'message') {
    target = '/messages';
  }
  if (navigate) navigate(target); else window.location.href = target;
}

// Signed in to push once per app open. The effect used to re-run on every
// screen change (useNavigate hands back a new function each time), so the
// phone was asked about notifications again on each page.
let syncedFor = '';

export default function OneSignalInit({ user }) {
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  // Taps on pushes (warm start) and the push that opened the app (cold start).
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let handle = null;
    let cancelled = false;
    (async () => {
      const NotifyBridge = await waitForPlugin('NotifyBridge', 15000);
      if (!NotifyBridge || cancelled) return;
      try {
        handle = await NotifyBridge.addListener?.('notificationOpened', (event) => {
          const data = event?.notification?.data || event?.data;
          handleNotificationData(data, navRef.current);
        });
      } catch (e) { /* older build */ }
      NotifyBridge.getLaunchNotification?.().then((result) => {
        if (result?.notification?.data) handleNotificationData(result.notification.data, navRef.current);
      }).catch(() => {});
    })();
    return () => { cancelled = true; handle?.remove?.(); };
  }, []);

  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) return;
      const userEmail = user?.email;
      let externalId;
      if (userEmail && userEmail.includes('@')) externalId = String(userEmail).toLowerCase().trim();
      else if (user?.id) externalId = `${user.id}@gencare.app`;
      else return;
      if (syncedFor === externalId) return;
      syncedFor = externalId;

      if (isNativeApp()) {
        const NotifyBridge = await waitForPlugin('NotifyBridge', 15000);
        if (!NotifyBridge) {
          console.warn('[OneSignal] NotifyBridge not found on this build');
          return;
        }
        // Android 13+ and iPhone need the person to allow notifications; this
        // is the system prompt, shown once. A new account gets it right after
        // the welcome chat, whose last line says it's coming (lib/welcome).
        await waitForWelcome();
        let permission = null;
        try { permission = await NotifyBridge.requestPermission(); } catch (permErr) { /* they said no, or an old build */ }
        markPermissionAnswered(permission?.granted);
        track('permission', 'notifications (asked)', permission?.granted ? 'granted' : 'not granted');
        const loginResult = await NotifyBridge.login({ externalId });
        if (loginResult?.playerId) await savePlayerId(loginResult.playerId);
        track(loginResult?.playerId ? 'action' : 'error', 'push sign-up', loginResult?.playerId ? 'push id saved' : 'no push id yet');
        // On a fresh install the push token lands a moment after login; save
        // the id again when it does, so the first pushes aren't lost.
        try {
          NotifyBridge.addListener?.('pushSubscriptionChanged', (state) => {
            if (state?.id) savePlayerId(state.id);
          });
        } catch (e) { /* older build */ }
        return;
      }

      // Browser
      if (!window.OneSignalDeferred) {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        const script = document.createElement('script');
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        document.head.appendChild(script);
      }
      window.OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.init({ appId: ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true, notifyButton: { enable: false } });
          await OneSignal.login(externalId);
          const subId = OneSignal.User?.PushSubscription?.id;
          if (subId) savePlayerId(subId);
          OneSignal.User?.PushSubscription?.addEventListener?.('change', () => {
            const id = OneSignal.User?.PushSubscription?.id;
            if (id) savePlayerId(id);
          });
          OneSignal.Notifications?.addEventListener?.('click', (event) => {
            handleNotificationData(event?.notification?.data, navRef.current);
          });
        } catch (error) {
          console.warn('[OneSignal] web init failed:', error?.message || error);
        }
      });
    };
    syncOneSignal();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

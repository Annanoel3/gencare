import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isNativeApp, waitForPlugin } from '@/lib/phone';

// Push notifications, ported from ADHDone's OneSignalInit.
//   - In the Android/iPhone app: the native OneSignal SDK through NotifyBridge
//     (login with the person's email as external id, which is what every push
//     from the server targets — see base44/shared/push.ts).
//   - In a browser: OneSignal's web SDK.
// A tap on a push lands on the screen the push names (data.screen), with the
// calendar opened on the event's day.

const ONESIGNAL_APP_ID = '067a47c8-a2c2-4307-8461-a329aaff6a2b';

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
  if ((data.type === 'appointment' || data.type === 'appointment_reminder') && data.date) {
    target = `/calendar?date=${encodeURIComponent(data.date)}${data.appointmentId ? `&open=${encodeURIComponent(data.appointmentId)}` : ''}`;
  } else if (data.type === 'task' || data.type === 'task_due') {
    target = `/tasks${data.taskId ? `?open=${encodeURIComponent(data.taskId)}` : ''}`;
  } else if (data.type === 'message') {
    target = '/messages';
  }
  if (navigate) navigate(target); else window.location.href = target;
}

export default function OneSignalInit({ user }) {
  const navigate = useNavigate();

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
          handleNotificationData(data, navigate);
        });
      } catch (e) { /* older build */ }
      NotifyBridge.getLaunchNotification?.().then((result) => {
        if (result?.notification?.data) handleNotificationData(result.notification.data, navigate);
      }).catch(() => {});
    })();
    return () => { cancelled = true; handle?.remove?.(); };
  }, [navigate]);

  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) return;
      const userEmail = user?.email;
      let externalId;
      if (userEmail && userEmail.includes('@')) externalId = String(userEmail).toLowerCase().trim();
      else if (user?.id) externalId = `${user.id}@gencare.app`;
      else return;

      if (isNativeApp()) {
        const NotifyBridge = await waitForPlugin('NotifyBridge', 15000);
        if (!NotifyBridge) {
          console.warn('[OneSignal] NotifyBridge not found on this build');
          return;
        }
        // Android 13+ needs the person to allow notifications; this is the
        // system prompt, shown once.
        try { await NotifyBridge.requestPermission(); } catch (permErr) { /* they said no, or an old build */ }
        const loginResult = await NotifyBridge.login({ externalId });
        if (loginResult?.playerId) await savePlayerId(loginResult.playerId);
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
            handleNotificationData(event?.notification?.data, navigate);
          });
        } catch (error) {
          console.warn('[OneSignal] web init failed:', error?.message || error);
        }
      });
    };
    syncOneSignal();
  }, [user, navigate]);

  return null;
}

import { useEffect } from 'react';

function isRunningInCapacitor() {
    return window.Capacitor?.isNativePlatform?.() ?? false;
}

export default function OneSignalInit({ user }) {
  useEffect(() => {
    if (!isRunningInCapacitor() && !window.OneSignalDeferred) {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) return;
      const userEmail = user?.email;
      let externalId;
      if (userEmail && userEmail.includes('@')) {
        externalId = userEmail;
      } else if (user?.id) {
        externalId = `${user.id}@gencare.app`;
      } else return;

      if (isRunningInCapacitor()) {
        const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;
        if (!NotifyBridge) return;
        if (externalId) {
          try { await NotifyBridge.requestPermission(); } catch (permErr) {}
          await NotifyBridge.login({ externalId: externalId });
        } else {
          await NotifyBridge.logout();
        }
      } else {
        const initOneSignal = () => {
          if (!window.OneSignalDeferred) { setTimeout(initOneSignal, 500); return; }
          window.OneSignalDeferred.push(async function(OneSignal) {
            try {
              await OneSignal.init({
                appId: "GENCARE_ONESIGNAL_APP_ID",
                allowLocalhostAsSecureOrigin: true,
                notifyButton: { enable: false }
              });
              if (externalId) await OneSignal.login(externalId);
            } catch (error) {}
          });
        };
        initOneSignal();
      }
    };
    syncOneSignal();
  }, [user]);
  return null;
}
import React, { useEffect, useState } from 'react';
import { BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isNativeApp, plugin, waitForPlugin } from '@/lib/phone';

const SNOOZE_KEY = 'gencare_notif_banner_snoozed';
const SNOOZE_MS = 3 * 24 * 3600e3;

// Shows when the phone (or browser) is blocking GenCare's notifications, so
// nobody silently misses family events and reminders. Checks again whenever
// the app comes back to the front. "Not now" hides it for 3 days.
export default function NotificationsOffBanner() {
  const [off, setOff] = useState(false);
  const [snoozed, setSnoozed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < SNOOZE_MS; } catch (e) { return false; }
  });

  const check = async () => {
    try {
      if (isNativeApp()) {
        const NB = plugin('NotifyBridge') || await waitForPlugin('NotifyBridge', 6000);
        if (!NB?.getPermissionState) return; // an older build: nothing to check
        const r = await NB.getPermissionState();
        setOff(r?.granted === false);
      } else if (typeof Notification !== 'undefined') {
        setOff(Notification.permission === 'denied');
      }
    } catch (e) { /* leave it */ }
  };

  useEffect(() => {
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!off || snoozed) return null;

  const fix = async () => {
    if (isNativeApp()) {
      const NB = plugin('NotifyBridge');
      try { await NB?.requestPermission?.(); } catch (e) { /* fine */ }
      try { const r = await NB?.getPermissionState?.(); if (r?.granted) { setOff(false); return; } } catch (e) { /* fine */ }
      try { await NB?.openNotificationSettings?.(); } catch (e) { /* fine */ }
    } else if (typeof Notification !== 'undefined') {
      try { const p = await Notification.requestPermission(); if (p === 'granted') setOff(false); } catch (e) { /* fine */ }
    }
  };
  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch (e) { /* fine */ }
    setSnoozed(true);
  };

  return (
    <div className="mx-4 mt-4 lg:mx-0 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-center gap-3">
      <BellOff className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <p className="text-sm flex-1">Notifications are off, so you won't hear about family events or reminders.</p>
      <Button size="sm" onClick={fix}>Turn on</Button>
      <button type="button" onClick={snooze} aria-label="Not now" className="text-muted-foreground"><X className="w-4 h-4" /></button>
    </div>
  );
}

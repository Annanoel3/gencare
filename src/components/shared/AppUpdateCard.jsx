import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAndroidApp, plugin, appBuild } from '@/lib/phone';

// The Android build everyone should be on. Bump when a new AAB is approved on
// Google Play (Anna's rule: an approved build is the go signal). Builds below
// this see the card on every open until they update — Play's own update
// screen opens inside the app (NotifyBridge.startAppUpdate / InAppUpdate).
export const LATEST_BUILD = 2;

export default function AppUpdateCard() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAndroidApp()) return;
    appBuild().then((b) => { if (b > 0 && b < LATEST_BUILD) setShow(true); });
  }, []);

  if (!show) return null;

  const update = async () => {
    setBusy(true);
    const NB = plugin('NotifyBridge');
    try {
      const r = await NB?.startAppUpdate?.();
      if (r?.result !== 'started') await NB?.openPlayStore?.();
    } catch (e) {
      try { await NB?.openPlayStore?.(); } catch (e2) { /* nothing more to try */ }
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-4 mt-4 lg:mx-0 rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-center gap-3">
      <RefreshCw className="w-5 h-5 text-primary flex-shrink-0" />
      <p className="text-sm flex-1">There's an update for GenCare.</p>
      <Button size="sm" onClick={update} disabled={busy}>{busy ? 'Opening…' : 'Update'}</Button>
    </div>
  );
}

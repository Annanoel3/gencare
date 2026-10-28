// Which app is running this website: the Android app (Capacitor), the iPhone
// app, or a plain browser. Same shape as ADHDone's phonePlatform.js.

export function phonePlatform() {
  try {
    const p = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : '';
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch (e) {
    return 'web';
  }
}

export const isNativeApp = () => phonePlatform() !== 'web';
export const isAndroidApp = () => phonePlatform() === 'android';
export const isIPhoneApp = () => phonePlatform() === 'ios';

export function plugin(name) {
  return (typeof window !== 'undefined' && window.Capacitor?.Plugins?.[name]) || null;
}

// The native bridge attaches a moment after the web layer boots; wait for it
// instead of checking once (ADHDone learned this the hard way).
export function waitForPlugin(name, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      const found = plugin(name);
      if (found || Date.now() - startedAt > timeoutMs) return resolve(found || null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

// Android versionCode of the running build, if the app reports it. Older
// builds don't; the web app then treats them as build 1.
export async function appBuild() {
  if (!isNativeApp()) return 0;
  try {
    const App = plugin('App') || await waitForPlugin('App', 4000);
    const info = await App?.getInfo?.();
    const n = parseInt(info?.build, 10);
    // No answer: assume the newest build rather than nag someone who is on it.
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

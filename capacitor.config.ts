import type { CapacitorConfig } from '@capacitor/cli';

// GenCare's phone apps (Android under android/, iPhone under ios/) are thin
// shells around the published web app: the WebView loads gencare.base44.app,
// so most changes ship with a Base44 publish and never need a new store build.
// Only the native pieces (push, phone calendars, the recorder, billing) live
// in the native projects.
const config: CapacitorConfig = {
  appId: 'com.mediocreatbest.gencare',
  appName: 'GenCare',
  webDir: 'dist',
  server: {
    url: 'https://gencare.base44.app',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      '*.base44.app',
      'base44.app',
      '*.base44.com',
      'accounts.google.com',
      '*.google.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    // Google's sign-in page refuses "embedded" browsers; a Safari-like agent
    // is what ADHDone's Android shell does too (it strips the "; wv" marker).
    overrideUserAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 GenCare',
  },
};

export default config;

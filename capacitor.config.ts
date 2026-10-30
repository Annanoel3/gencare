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
      // Sign in with Apple (App Store guideline 4.8) opens Apple's page in the app.
      'appleid.apple.com',
      'idmsa.apple.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      // The cream behind the GenCare logo on the launch images.
      backgroundColor: '#F9F5EC',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: false,
    // No captureInput: it swaps the keyboard connection for a bare one that
    // can't paste from the keyboard's clipboard (and loses suggestions).
    webContentsDebuggingEnabled: false,
  },
  ios: {
    // The page reaches the top of the screen and keeps clear of the status bar
    // itself, with a solid strip behind it. With 'automatic', the page scrolled
    // up under a see-through status bar (Anna, Oct 30 2026). index.html turns
    // the page's side of this on when it sees GenCareEdge/ in the agent.
    contentInset: 'never',
    // Google's sign-in page refuses "embedded" browsers; a Safari-like agent
    // is what ADHDone's Android shell does too (it strips the "; wv" marker).
    overrideUserAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 GenCare GenCareEdge/1',
  },
};

export default config;

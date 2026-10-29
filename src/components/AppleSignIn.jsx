import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { phonePlatform, appBuild } from '@/lib/phone';

// Apple requires "Sign in with Apple" next to "Continue with Google" in an
// iPhone app (App Store Review Guideline 4.8). Apple sign-in is turned on in
// Base44's authentication settings. Inside the iPhone app it only works from
// build 4, the first build that lets Apple's sign-in page open in the app
// (capacitor.config allowNavigation: appleid.apple.com); older builds and the
// Android app don't show it. Websites always do.
const FIRST_IOS_BUILD = 4;

export function useAppleSignIn() {
  const [show, setShow] = useState(() => phonePlatform() === 'web');
  useEffect(() => {
    if (phonePlatform() !== 'ios') return;
    appBuild().then((b) => setShow(b >= FIRST_IOS_BUILD)).catch(() => {});
  }, []);
  return show;
}

function AppleLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.37 12.62c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.54zM14.2 6.16c.61-.74 1.02-1.76.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.22z" />
    </svg>
  );
}

export default function AppleSignInButton({ className = '' }) {
  const show = useAppleSignIn();
  if (!show) return null;
  return (
    <Button variant="outline" className={`w-full h-12 text-sm font-medium ${className}`} onClick={() => base44.auth.loginWithProvider('apple', '/')}>
      <AppleLogo className="w-5 h-5 mr-2" />
      Continue with Apple
    </Button>
  );
}

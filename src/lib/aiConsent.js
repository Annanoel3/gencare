import { base44 } from '@/api/base44Client';
import { track } from '@/lib/activity';

// May GenCare send things to OpenAI for this person? (Apple's App Review
// Guideline 5.1.2(i): say what goes to a third-party AI, name who gets it,
// and get permission first. Anna, Nov 20 2026: "sure. build that in".)
// Saved on the account as ai_consent: 'yes', 'no' (asked, said Not now) or
// unset (never asked). The backend functions refuse AI work without 'yes'
// (base44/shared/aiConsent.ts), so this is the app's half: asking.
//
// AiConsentDialog (mounted once, in AppLayout) shows the question; askAi()
// opens it when something needs an answer and resolves with it.

export const AI_ASK_EVENT = 'gencare-ai-ask';
let consent; // undefined = not loaded yet
const listeners = new Set();

export const aiConsentOf = (u) => (u?.ai_consent === 'yes' ? 'yes' : u?.ai_consent === 'no' ? 'no' : '');
export const aiAllowedNow = () => consent === 'yes';
export const aiConsentNow = () => consent;

export function setAiConsentKnown(value) {
  consent = value;
  for (const l of [...listeners]) l(value);
}
export function onAiConsent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Save the answer on the account (and here right away). */
export async function saveAiConsent(yes, how = '') {
  const value = yes ? 'yes' : 'no';
  setAiConsentKnown(value);
  track('action', yes ? 'ai allowed' : 'ai not allowed', how);
  await base44.auth.updateMe({ ai_consent: value, ai_consent_at: new Date().toISOString() });
}

/**
 * Before something sends a person's things to OpenAI: true when it may.
 * reason: one line saying what this one sends, like "To write notes from a
 * recording, GenCare sends the recording to OpenAI."
 */
export function askAi(reason = '') {
  if (consent === 'yes') return Promise.resolve(true);
  return new Promise((resolve) => {
    try { window.dispatchEvent(new CustomEvent(AI_ASK_EVENT, { detail: { reason, resolve } })); } catch { resolve(false); }
  });
}

/** The backend said no (consent was turned off somewhere else, say). */
export function aiRefused(errOrRes) {
  const x = errOrRes;
  return [x?.response?.data?.error, x?.data?.error, x?.error, x?.message].includes('ai_consent');
}

/**
 * Ask if needed, call, and ask again if the backend says it doesn't have
 * permission. Returns the call's result, or { declined: true }.
 */
export async function withAi(reason, call) {
  if (!(await askAi(reason))) return { declined: true };
  try {
    const res = await call();
    if (!aiRefused(res)) return res;
  } catch (e) {
    if (!aiRefused(e)) throw e;
  }
  setAiConsentKnown('');
  if (!(await askAi(reason))) return { declined: true };
  return call();
}

// Has this person said GenCare may send their things to OpenAI? (Apple's App
// Review Guideline 5.1.2(i); Anna, Nov 20 2026.) The app asks
// (src/lib/aiConsent.js, components/shared/AiConsentDialog) and saves the
// answer on the User row as ai_consent: 'yes', 'no' or unset. Every function
// that calls OpenAI checks it first, so nothing goes out without a yes.
export const aiOk = (user: any) => user?.ai_consent === 'yes';

// What a function answers instead; the app shows the question and tries again.
export const aiRefusal = () => Response.json({ ok: false, error: 'ai_consent' }, { status: 403 });

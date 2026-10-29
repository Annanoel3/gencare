import { base44 } from '@/api/base44Client';
import { phonePlatform, appBuild, plugin } from '@/lib/phone';

// Record keeping for the app's owner (Anna, Oct 29 2026: "good record keeping
// for iPhone users especially, to see what's working"). Each session logs:
// the app opening (iPhone app / Android app / website, its build and the
// phone's system), which screens are opened, what gets added or finished, the
// errors people hit, and whether notifications are allowed. Never the words
// people type: names here are fixed labels like "add:task". Rows go to
// AppActivity, which only admins can read (the Activity page).
//
// Writes are batched (every 10 seconds, and when the app goes to the
// background) so this never slows anything down, and a failure is ignored.

let user = null;
let ctx = { platform: 'web', build: 0, os: '' };
let queue = [];
let timer = null;
let started = false;
const session = Math.random().toString(36).slice(2, 10);
const seenErrors = new Set();

export function osName() {
  try {
    const ua = navigator.userAgent || '';
    // The iPhone app sends a fixed Safari user agent ending in "GenCare"
    // (capacitor.config overrideUserAgent), so its iOS version isn't real.
    if (/ GenCare$/.test(ua)) return 'iOS';
    let m = ua.match(/(?:iPhone|CPU) OS (\d+)[._](\d+)/);
    if (m) return `iOS ${m[1]}.${m[2]}`;
    m = ua.match(/Android (\d+(?:\.\d+)?)/);
    if (m) return `Android ${m[1]}`;
    if (/Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return '';
  } catch (e) { return ''; }
}

function flush() {
  clearTimeout(timer); timer = null;
  if (!user || !queue.length) return;
  const rows = queue.splice(0, 50);
  const api = base44.entities.AppActivity;
  const send = typeof api.bulkCreate === 'function' ? api.bulkCreate(rows) : Promise.all(rows.map((r) => api.create(r)));
  Promise.resolve(send).catch(() => { /* record keeping never gets in the way */ });
}

function schedule() {
  if (queue.length >= 25) return flush();
  if (!timer) timer = setTimeout(flush, 10000);
}

/** Log one thing. kind: 'screen' | 'action' | 'error' | 'permission'. */
export function track(kind, name, detail = '') {
  try {
    if (kind === 'error') {
      const key = `${name}|${detail}`;
      if (seenErrors.has(key)) return; // the same error once per session
      seenErrors.add(key);
    }
    const row = {
      kind, name: String(name || '').slice(0, 120), detail: String(detail || '').slice(0, 300),
      platform: ctx.platform, build: ctx.build, os: ctx.os, session, at: new Date().toISOString(),
    };
    if (user) { queue.push({ ...row, user_id: user.id, user_name: user.name, family_id: user.family_id }); schedule(); }
    else queue.push(row); // before sign-in finishes; filled in by startActivity
  } catch (e) { /* never throw from here */ }
}

async function notificationState() {
  try {
    const nb = plugin('NotifyBridge');
    if (nb?.getPermissionState) {
      const r = await nb.getPermissionState();
      return String(r?.state ?? r?.permission ?? (r?.granted === true ? 'granted' : r?.granted === false ? 'denied' : 'unknown'));
    }
    if (typeof Notification !== 'undefined') return Notification.permission;
  } catch (e) { /* fall through */ }
  return 'unknown';
}

/** Once per app session, after the person's family has loaded. */
export async function startActivity(me) {
  if (started || !me?.id) return;
  started = true;
  ctx = { platform: phonePlatform(), build: (await appBuild()) || 0, os: osName() };
  user = { id: me.id, name: me.display_name || me.full_name || '', family_id: me.family_id || '' };
  // Rows logged before this point get who and where now.
  queue = queue.map((r) => ({ ...r, platform: ctx.platform, build: ctx.build, os: ctx.os, user_id: user.id, user_name: user.name, family_id: user.family_id }));
  track('open', ctx.platform === 'ios' ? 'iPhone app' : ctx.platform === 'android' ? 'Android app' : 'website', typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '');
  track('permission', 'notifications', await notificationState());
  // The page reloaded itself after a blank screen (index.html).
  try {
    const why = localStorage.getItem('gencare_blank_reload_seen');
    if (why) { track('error', 'blank screen, reloaded itself', why); localStorage.removeItem('gencare_blank_reload_seen'); }
  } catch (e) { /* storage off */ }

  window.addEventListener('error', (e) => track('error', 'script error', `${e?.message || ''} ${e?.filename ? `@ ${String(e.filename).split('/').pop()}:${e.lineno}` : ''}`.trim()));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    track('error', 'unhandled', String(r?.message || r || '').slice(0, 300));
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  flush();
}

/** What platform/build this session is (for the support form and the like). */
export const activityContext = () => ({ ...ctx, session });

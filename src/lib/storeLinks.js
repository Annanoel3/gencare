import { isAndroidApp, isIPhoneApp, plugin } from '@/lib/phone';
import { PLAY_STORE_URL, openInPlay } from '@/lib/premium';

// Where people get GenCare, for Rate GenCare and Share GenCare in Settings
// (testers' report, Nov 2026).
//
// Turn these on when each store's listing is public. Until then the link only
// opens for testers (Google Play) or doesn't exist yet (App Store), so Share
// stays hidden, and Rate shows only where a listing can be opened.
export const PLAY_PUBLIC = false; // GenCare is in closed testing on Google Play (Nov 18 2026)
export const APP_STORE_URL = ''; // e.g. https://apps.apple.com/app/id0000000000, once it's live

// Rate: Android (testers can leave feedback on the testing listing too), and
// iPhone once the App Store listing is live.
export const canRate = () => isAndroidApp() || (isIPhoneApp() && !!APP_STORE_URL);

export async function openRating() {
  if (isAndroidApp()) {
    // The Play Store app itself, on GenCare's page.
    const nb = plugin('NotifyBridge');
    if (nb?.openPlayStore) { try { await nb.openPlayStore(); return; } catch (e) { /* the web page instead */ } }
    openInPlay(PLAY_STORE_URL);
    return;
  }
  if (APP_STORE_URL) window.location.href = `${APP_STORE_URL}?action=write-review`;
}

// Share: the links that work for anyone.
export function shareLinks() {
  const links = [];
  if (PLAY_PUBLIC) links.push({ store: 'Android', url: PLAY_STORE_URL });
  if (APP_STORE_URL) links.push({ store: 'iPhone', url: APP_STORE_URL });
  return links;
}
export const canShare = () => shareLinks().length > 0;

export function shareMessage() {
  const links = shareLinks();
  const where = links.length === 1 ? `Here's the link: ${links[0].url}` : links.map((l) => `${l.store}: ${l.url}`).join('\n');
  return `I'm using GenCare to keep our family's care organized: the family calendar, reminders and notes from appointments, all in one place. ${where}`;
}

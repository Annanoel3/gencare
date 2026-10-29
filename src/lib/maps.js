import { phonePlatform } from '@/lib/phone';

// Opening an address in the phone's maps app (Anna, Oct 29 2026: tapping an
// address should open "their maps, or Waze, or whatever they use").
//   Android: a geo: link. The app hands it to Android (MainActivity's
//            launchExternalScheme), which opens the person's maps app, or asks
//            which one when they haven't picked a default (Google Maps, Waze…).
//   iPhone:  there's no "pick an app" on iOS, so the caller shows a choice of
//            Apple Maps, Google Maps or Waze (window.open is handed to iOS by
//            the app, so each opens in its own app when it's installed).
//   Website: Google Maps in a new tab.

export const needsMapChoice = () => phonePlatform() === 'ios';

const q = (address) => encodeURIComponent(String(address || '').trim());

export const MAP_APPS = [
  { key: 'apple', label: 'Apple Maps', url: (a) => `maps://?q=${q(a)}` },
  { key: 'google', label: 'Google Maps', url: (a) => `https://www.google.com/maps/search/?api=1&query=${q(a)}` },
  { key: 'waze', label: 'Waze', url: (a) => `https://waze.com/ul?q=${q(a)}&navigate=yes` },
];

export function openMaps(address, appKey) {
  if (!String(address || '').trim()) return;
  const p = phonePlatform();
  if (p === 'android') { window.location.href = `geo:0,0?q=${q(address)}`; return; }
  if (p === 'ios') {
    const app = MAP_APPS.find((m) => m.key === appKey) || MAP_APPS[0];
    try { localStorage.setItem('gencare_maps_app', app.key); } catch (e) { /* storage off */ }
    window.open(app.url(address), '_blank');
    return;
  }
  window.open(MAP_APPS[1].url(address), '_blank', 'noopener');
}

/** The iPhone maps app picked last time, so it can be listed first. */
export function lastMapsApp() {
  try { return localStorage.getItem('gencare_maps_app') || ''; } catch (e) { return ''; }
}

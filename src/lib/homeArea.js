import { base44 } from '@/api/base44Client';

// The person's home ZIP, as GenCare uses it: places near home come up first
// in place search (AddressField), and Resources opens each program on their
// own state and ZIP. One check per app session, shared by every screen, and
// dropped the moment they save a new ZIP (welcome chat, an event's "Where").
//
// { zip, own, from, state }: `own` is false when the ZIP is someone else's in
// the family (it's still used until they give their own); `from` is that
// person's first name, when the server knows one.
let pending = null;
const EVENT = 'gencare-home-zip';

export function homeArea() {
  if (!pending) {
    pending = base44.functions.invoke('placesAutocomplete', { warm: true })
      .then((r) => { const d = r?.data || r; return { zip: d?.zip || '', own: !!d?.own, from: d?.from || '', state: d?.state || '' }; })
      .catch(() => { pending = null; return null; });
  }
  return pending;
}

export const isZip = (z) => /^\d{5}$/.test(String(z || ''));

/** Saves the person's own home ZIP and tells every screen to check again. */
export async function saveHomeZip(zip) {
  const z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (!isZip(z)) throw new Error('A ZIP code is 5 numbers');
  await base44.auth.updateMe({ help_zip: z });
  pending = null;
  try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* fine */ }
  return z;
}

/** Calls `fn` after a new home ZIP is saved. Returns an unsubscribe. */
export function onHomeZip(fn) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

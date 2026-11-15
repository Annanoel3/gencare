import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// Saved places (Anna, Nov 14 2026: "the best way to tell the app that
// everything that says dripping springs has a specific address while
// everything at central has another"). A place as a schedule writes it
// ("7115- Dripping Springs") and the address the family picked for it. The
// photo import asks once for each place on a photo, fills in the ones it
// knows, and saves what's picked; the Where box offers them too.

export const SAVED_PLACES_KEY = ['savedPlaces'];
export const listSavedPlaces = () => base44.entities.SavedPlace.list('-updated_date', 300).catch(() => []);

/** The place as written, before any address part, in plain lowercase words. */
export const placeKey = (s) => String(s || '').split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Its words: numbers (a clinic's code like 7115) and words of 2 or more letters. */
const words = (s) => placeKey(s).split(' ').filter((w) => /^\d+$/.test(w) || w.length >= 2);
const letterWords = (s) => words(s).filter((w) => !/^\d+$/.test(w));
const within = (a, b) => a.length > 0 && a.every((w) => b.includes(w));

/**
 * Do two ways of writing a place mean the same one? The same words, or one
 * inside the other with at least two words in common ("7115- Dripping
 * Springs" and "Spero Rehab 7115- Dripping Springs"; "Austin" alone is too
 * little to go on).
 */
export function samePlace(a, b) {
  const ka = placeKey(a);
  const kb = placeKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const wa = words(a);
  const wb = words(b);
  const small = wa.length <= wb.length ? wa : wb;
  return small.length >= 2 && (within(wa, wb) || within(wb, wa));
}

/** The saved place for a place as written, or null. */
export const savedFor = (text, saved = []) => (saved || []).find((p) => samePlace(p.label, text) || placeKey(p.key) === placeKey(text)) || null;

/**
 * An address the family already used that a place as written clearly names:
 * its words (not counting numbers, at least two of them) all in the name of
 * one past place, and only one such place. "7115- Dripping Springs" ->
 * "Spero Rehab Dripping Springs, Sportsplex Drive, ...".
 */
export function pastFor(text, pastAddresses = []) {
  const lw = letterWords(text);
  if (lw.length < 2) return null;
  const hits = [...new Set((pastAddresses || []).filter((a) => a && a.includes(',') && within(lw, letterWords(a))))];
  return hits.length === 1 ? hits[0] : null;
}

/** Past addresses that share a word with a place as written, to offer as choices. */
export function pastLike(text, pastAddresses = [], max = 3) {
  const lw = letterWords(text);
  if (!lw.length) return [];
  return [...new Set((pastAddresses || []).filter((a) => a && a.includes(',') && letterWords(a).some((w) => lw.includes(w))))].slice(0, max);
}

/** Saves what the family picked for each place (one row a place, the newest pick wins). */
export async function rememberPlaces(pairs, saved = [], me = null) {
  for (const { label, address } of pairs) {
    const addr = String(address || '').trim();
    if (!addr || placeKey(addr) === placeKey(label)) continue;
    const have = savedFor(label, saved);
    const data = { key: placeKey(label), label: String(label).trim(), address: addr, added_by_user_id: me?.id || '', added_by_name: me?.display_name || me?.full_name || '' };
    try {
      if (have?.id) { if (have.address !== addr) await base44.entities.SavedPlace.update(have.id, { address: addr }); }
      else await base44.entities.SavedPlace.create(withFamily(data));
    } catch { /* a place not saved just isn't filled in next time */ }
  }
}

/** Saved places for what's typed in a Where box: by what it's called or its address. */
export function savedMatching(typed, saved = []) {
  const t = placeKey(typed);
  if (t.length < 2) return [];
  const tw = words(typed);
  return (saved || []).filter((p) => {
    const k = `${placeKey(p.label)} ${placeKey(p.address)}`;
    return k.includes(t) || (tw.length && tw.every((w) => k.split(' ').some((x) => x.startsWith(w))));
  }).slice(0, 3);
}

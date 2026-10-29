import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// Address and place-name suggestions for an event's "Where" (same idea as
// ADHDone's: type "HEB South Austin" and pick the full address). Uses the
// GOOGLE_MAPS_API_KEY secret, so the key never reaches the phone. Signed-in
// people only, so nobody outside GenCare can spend the key.
//
// Near home first (Anna, Oct 29 2026: results weren't about the user's area,
// because Google guesses from the server's location). The home ZIP is the
// one people already give for "Places near you" on Resources (User.help_zip);
// without one of their own, someone else's in the family is used. It's only
// a ZIP they typed: GenCare never asks for or tracks the phone's location.
//
// { warm: true } just answers whether there's a ZIP and which state it's in
// (and gets this function started), so the first real search comes back
// quickly and Resources can open each state's own page. No Places charge.

type Center = { lat: number; lng: number; state: string };
const centers = new Map<string, Center | null>(); // ZIP -> center and state, kept while this copy runs
const familyZip = new Map<string, { zip: string; from: string; at: number }>();

async function centerOf(zip: string, key: string) {
  if (centers.has(zip)) return centers.get(zip);
  let c: Center | null = null;
  try {
    const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    u.searchParams.set('components', `postal_code:${zip}|country:US`);
    u.searchParams.set('key', key);
    const d = await (await fetch(u.toString())).json();
    const r0 = d?.results?.[0];
    const loc = r0?.geometry?.location;
    // Two-letter state (or DC / PR) from the same answer, no extra charge.
    const st = (r0?.address_components || []).find((x: any) => (x.types || []).includes('administrative_area_level_1'))?.short_name || '';
    if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) c = { lat: loc.lat, lng: loc.lng, state: /^[A-Z]{2}$/.test(st) ? st : '' };
  } catch (_e) { c = null; }
  centers.set(zip, c);
  return c;
}

const isZip = (z: unknown) => /^\d{5}$/.test(String(z || ''));
// How far from home counts as near: about 50 miles, so the next town over
// (a hospital, a parent's house) still comes up as local.
const NEAR_METERS = 80000;

async function homeZip(base44: any, user: any) {
  if (isZip(user.help_zip)) return { zip: String(user.help_zip), own: true, from: '' };
  if (!user.family_id) return { zip: '', own: false, from: '' };
  const hit = familyZip.get(user.family_id);
  if (hit && Date.now() - hit.at < 30 * 60000) return { zip: hit.zip, own: false, from: hit.from };
  let zip = '';
  let from = '';
  try {
    const mates = (await base44.asServiceRole.entities.User.filter({ family_id: user.family_id })) || [];
    const mate = mates.find((m: any) => m.id !== user.id && isZip(m.help_zip));
    zip = String(mate?.help_zip || '');
    // Whose it is (first name), so the welcome chat can offer "same as Sam's".
    // (An email sign-up's full_name is just the start of the email, so only a
    // shown name, or a full name with a space in it, counts.)
    const shown = String(mate?.display_name || '').trim() || (/\s/.test(String(mate?.full_name || '').trim()) ? String(mate.full_name).trim() : '');
    from = shown.split(/\s+/)[0] || '';
  } catch (_e) { zip = ''; }
  familyZip.set(user.family_id, { zip, from, at: Date.now() });
  return { zip, own: false, from };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_e) { user = null; }
    if (!user?.id) return Response.json({ suggestions: [], error: 'Sign in first' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const apiKey = (Deno.env.get('GOOGLE_MAPS_API_KEY') || '').trim();
    const home = await homeZip(base44, user);

    if (payload?.warm) {
      const c = home.zip && apiKey ? await centerOf(home.zip, apiKey) : null;
      return Response.json({ ok: true, zip: home.zip, own: home.own, from: home.from || '', state: c?.state || '' });
    }

    const q = String(payload?.input || '').trim().slice(0, 200);
    if (q.length < 2) return Response.json({ suggestions: [], zip: home.zip });
    if (!apiKey) {
      console.error('[PLACES] GOOGLE_MAPS_API_KEY missing');
      return Response.json({ suggestions: [], reason: 'no_key', zip: home.zip });
    }

    const center = home.zip ? await centerOf(home.zip, apiKey) : null;
    const search = async (near: boolean) => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', q);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('components', 'country:us');
      if (center) {
        url.searchParams.set('location', `${center.lat},${center.lng}`);
        url.searchParams.set('radius', String(NEAR_METERS));
        // Only places inside the circle. Without this Google treats home as a
        // hint and still mixes in other states (Anna, Oct 29 2026).
        if (near) url.searchParams.set('strictbounds', 'true');
      }
      const data = await (await fetch(url.toString())).json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[PLACES] autocomplete error:', data.status, data.error_message);
        throw new Error(data.error_message || data.status);
      }
      return (data.predictions || []).map((p: any) => p.description).filter(Boolean) as string[];
    };

    // Near home first. Only when that finds almost nothing (a trip, an
    // address out of town) does the wider search fill in, after the near ones.
    let suggestions: string[] = [];
    try {
      suggestions = await search(!!center);
      if (center && suggestions.length < 2) {
        const wide = await search(false);
        suggestions = [...suggestions, ...wide.filter((s) => !suggestions.includes(s))];
      }
    } catch (e) {
      return Response.json({ suggestions, error: (e as Error).message, zip: home.zip });
    }
    return Response.json({ suggestions: suggestions.slice(0, 5), zip: home.zip });
  } catch (error) {
    return Response.json({ suggestions: [], error: (error as Error).message }, { status: 500 });
  }
}

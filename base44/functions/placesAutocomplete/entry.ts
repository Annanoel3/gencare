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
// { warm: true } just answers whether there's a ZIP (and gets this function
// started), so the first real search comes back quickly. No Places charge.

const centers = new Map<string, { lat: number; lng: number } | null>(); // ZIP -> center, kept while this copy runs
const familyZip = new Map<string, { zip: string; at: number }>();

async function centerOf(zip: string, key: string) {
  if (centers.has(zip)) return centers.get(zip);
  let c: { lat: number; lng: number } | null = null;
  try {
    const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    u.searchParams.set('components', `postal_code:${zip}|country:US`);
    u.searchParams.set('key', key);
    const d = await (await fetch(u.toString())).json();
    const loc = d?.results?.[0]?.geometry?.location;
    if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) c = { lat: loc.lat, lng: loc.lng };
  } catch (_e) { c = null; }
  centers.set(zip, c);
  return c;
}

const isZip = (z: unknown) => /^\d{5}$/.test(String(z || ''));

async function homeZip(base44: any, user: any) {
  if (isZip(user.help_zip)) return { zip: String(user.help_zip), own: true };
  if (!user.family_id) return { zip: '', own: false };
  const hit = familyZip.get(user.family_id);
  if (hit && Date.now() - hit.at < 30 * 60000) return { zip: hit.zip, own: false };
  let zip = '';
  try {
    const mates = (await base44.asServiceRole.entities.User.filter({ family_id: user.family_id })) || [];
    zip = String(mates.find((m: any) => isZip(m.help_zip))?.help_zip || '');
  } catch (_e) { zip = ''; }
  familyZip.set(user.family_id, { zip, at: Date.now() });
  return { zip, own: false };
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
      if (home.zip && apiKey) await centerOf(home.zip, apiKey);
      return Response.json({ ok: true, zip: home.zip, own: home.own });
    }

    const q = String(payload?.input || '').trim().slice(0, 200);
    if (q.length < 2) return Response.json({ suggestions: [], zip: home.zip });
    if (!apiKey) {
      console.error('[PLACES] GOOGLE_MAPS_API_KEY missing');
      return Response.json({ suggestions: [], reason: 'no_key', zip: home.zip });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('components', 'country:us');
    const center = home.zip ? await centerOf(home.zip, apiKey) : null;
    if (center) {
      url.searchParams.set('location', `${center.lat},${center.lng}`);
      url.searchParams.set('radius', '40000'); // about 25 miles; nearer places rank first, farther ones still show
    }

    const data = await (await fetch(url.toString())).json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[PLACES] autocomplete error:', data.status, data.error_message);
      return Response.json({ suggestions: [], error: data.error_message || data.status, zip: home.zip });
    }
    const suggestions = (data.predictions || []).map((p: any) => p.description).filter(Boolean).slice(0, 5);
    return Response.json({ suggestions, zip: home.zip });
  } catch (error) {
    return Response.json({ suggestions: [], error: (error as Error).message }, { status: 500 });
  }
}

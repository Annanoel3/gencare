import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// Address and place-name suggestions for an event's "Where" (same as
// ADHDone's: type "HEB South Austin" and pick the full address). Uses the
// GOOGLE_MAPS_API_KEY secret, so the key never reaches the phone. Signed-in
// people only, so nobody outside GenCare can spend the key.
export default async function (req: Request) {
  try {
    let user: any = null;
    try { user = await createClientFromRequest(req).auth.me(); } catch (_e) { user = null; }
    if (!user?.id) return Response.json({ suggestions: [], error: 'Sign in first' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const q = String(payload?.input || '').trim().slice(0, 200);
    if (q.length < 3) return Response.json({ suggestions: [] });

    const apiKey = (Deno.env.get('GOOGLE_MAPS_API_KEY') || '').trim();
    if (!apiKey) {
      console.error('[PLACES] GOOGLE_MAPS_API_KEY missing');
      return Response.json({ suggestions: [], reason: 'no_key' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[PLACES] autocomplete error:', data.status, data.error_message);
      return Response.json({ suggestions: [], error: data.error_message || data.status });
    }
    const suggestions = (data.predictions || []).map((p: any) => p.description).filter(Boolean).slice(0, 5);
    return Response.json({ suggestions });
  } catch (error) {
    return Response.json({ suggestions: [], error: (error as Error).message }, { status: 500 });
  }
}

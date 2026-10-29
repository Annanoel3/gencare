import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import OpenAI from 'npm:openai';

// "Help near you" on the Resources page: someone types a ZIP code and gets
// real local places (their Area Agency on Aging, respite and adult day care,
// equipment loan closets, caregiver support groups, meals, rides), found by an
// OpenAI web search.
//
// Saved by ZIP for every family (Anna, Oct 29 2026: "if a user ever enters a
// zip that has already been entered by another family... only updating them
// like once every 6 months"), so a ZIP is searched about twice a year no
// matter how many families use it. A search costs roughly $0.01 per web
// search the model runs plus its reading (OpenAI web_search pricing, read Oct
// 29 2026), so a few cents per ZIP.
//
// Made-up places are the risk: a wrong phone number in a care app is worse
// than none. So a place is kept only when its link is a page the search
// actually opened (the response's sources and citations), and the page says
// to call ahead. Astra makes the call (Anna's model rule: judgment calls).

const MODEL = 'gpt-6-astra';
const BACKUP_MODEL = 'gpt-6-luna';
const KEEP_DAYS = 182; // about 6 months
const KEEP_EMPTY_DAYS = 7; // a search that found nothing is tried again sooner
const SEARCHES_PER_FAMILY_PER_DAY = 3; // only new ZIPs count; saved ones are free
const CATEGORIES = ['aging', 'respite', 'equipment', 'support', 'meals', 'rides', 'kids', 'other'];

const SYSTEM = `You find local help for families caring for each other: an older parent, someone recovering from a stroke or illness, a person with a disability, young kids. Search the web for free or low-cost help that serves the given US ZIP code, and return what you found.

Look for, in this order:
- aging: the Area Agency on Aging that serves this ZIP code (every US county has one; always look for it)
- respite: adult day programs and respite care (short breaks for the caregiver)
- equipment: medical equipment loan closets or reuse programs (free or cheap wheelchairs, walkers, shower chairs)
- support: caregiver support groups (in person or by phone)
- meals: meal delivery for older adults (the local Meals on Wheels program)
- rides: transportation for older adults or people with disabilities
- kids: the local child care resource and referral agency
- other: anything else clearly useful for a family caregiver here

Rules:
- Only include a place you found on a web page during this search, and give that page's link (the place's own site, or an official .gov or directory page about it). Never fill in a place, phone number or link from memory.
- Copy phone numbers exactly as the page shows them. If the page shows none, leave phone empty.
- Prefer nonprofits and government programs. Leave out for-profit home care agencies, senior living sales pages, lead-generation sites and ads.
- Only places that serve this ZIP code (its city or county). If you can't tell, leave it out.
- At most 12 places, the most useful first. One plain sentence each (under 25 words) saying what they do for a family.
- area: the city and county the ZIP code is in, like "Austin, Travis County, TX".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'places'],
  properties: {
    area: { type: 'string' },
    places: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'description', 'phone', 'url', 'city'],
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          description: { type: 'string' },
          phone: { type: 'string' },
          url: { type: 'string' },
          city: { type: 'string' },
        },
      },
    },
  },
};

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const daysOld = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;

// Every link the search opened or cited, so a place's link can be checked
// against what was really read.
function seenLinks(res: any) {
  const urls = new Set<string>();
  for (const item of res?.output || []) {
    if (item?.type === 'web_search_call') {
      for (const s of item?.action?.sources || []) if (s?.url) urls.add(String(s.url));
    }
    if (item?.type === 'message') {
      for (const c of item?.content || []) for (const a of c?.annotations || []) if (a?.type === 'url_citation' && a?.url) urls.add(String(a.url));
    }
  }
  return urls;
}

function outputText(res: any) {
  if (typeof res?.output_text === 'string' && res.output_text) return res.output_text;
  for (const item of res?.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item?.content || []) if (c?.type === 'output_text' && c?.text) return c.text;
  }
  return '';
}

async function search(zip: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Search is not set up');
  const openai = new OpenAI({ apiKey, timeout: 110000, maxRetries: 0 });
  let lastError: unknown = null;
  for (const model of [MODEL, BACKUP_MODEL]) {
    try {
      const res: any = await openai.responses.create({
        model,
        instructions: SYSTEM,
        input: `ZIP code: ${zip}`,
        tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'US' } }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema', name: 'local_help', strict: true, schema: SCHEMA } },
        max_output_tokens: 8000,
      } as any);
      const u = res?.usage || {};
      const calls = (res?.output || []).filter((o: any) => o?.type === 'web_search_call').length;
      console.log(`[ai] localHelp ${model} zip=${zip} searches=${calls} in=${u.input_tokens ?? '?'} out=${u.output_tokens ?? '?'}`);
      const parsed = JSON.parse(outputText(res) || '{}');
      const seen = seenLinks(res);
      const seenHosts = new Set([...seen].map(hostOf).filter(Boolean));
      const places = [];
      const names = new Set<string>();
      for (const p of Array.isArray(parsed?.places) ? parsed.places : []) {
        const url = clip(p?.url, 500);
        const host = hostOf(url);
        // The link has to be a page (or at least a site) the search really opened.
        if (!/^https?:\/\//i.test(url) || !host || !(seen.has(url) || seenHosts.has(host))) continue;
        const name = clip(p?.name, 120);
        if (!name || names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        const phone = clip(p?.phone, 40);
        places.push({
          name,
          category: CATEGORIES.includes(p?.category) ? p.category : 'other',
          description: clip(p?.description, 240),
          phone: /\d{3}.*\d{4}/.test(phone) || /^\d{3}$/.test(phone) ? phone : '',
          url,
          city: clip(p?.city, 60),
        });
      }
      return { area: clip(parsed?.area, 100), places: places.slice(0, 12) };
    } catch (e) {
      lastError = e;
      console.error(`[localHelp] ${model} failed:`, (e as any)?.message || e);
    }
  }
  throw lastError || new Error('Search failed');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const zip = String(body?.zip ?? user.help_zip ?? '').replace(/\D/g, '').slice(0, 5);
    // peek: the page opening; show saved results for the person's ZIP, never search.
    if (body?.peek && !/^\d{5}$/.test(zip)) return Response.json({ zip: '', area: '', places: [], searched_at: null, saved: false });
    if (!/^\d{5}$/.test(zip)) return Response.json({ error: 'Enter a 5-digit ZIP code' }, { status: 400 });
    const db = base44.asServiceRole.entities;

    // Remember the ZIP on the person, so the page shows it next time.
    if (!body?.peek && user.help_zip !== zip) await base44.auth.updateMe({ help_zip: zip }).catch(() => {});

    const saved = (await db.LocalHelpCache.filter({ zip }, '-searched_at', 1).catch(() => []))?.[0];
    const fresh = saved && daysOld(saved.searched_at) < ((saved.places || []).length ? KEEP_DAYS : KEEP_EMPTY_DAYS);
    if (fresh) return Response.json({ zip, area: saved.area || '', places: saved.places || [], searched_at: saved.searched_at, saved: true });
    if (body?.peek) return Response.json({ zip, area: '', places: [], searched_at: null, saved: false });

    // A new search costs money: a few per family per day.
    const familyId = user.family_id || `user:${user.id}`;
    const since = new Date(Date.now() - 86400000).toISOString();
    const recent = await db.LocalHelpCache.filter({ family_id: familyId, searched_at: { $gte: since } }, '-searched_at', 10).catch(() => []);
    if ((recent || []).length >= SEARCHES_PER_FAMILY_PER_DAY) {
      if (saved) return Response.json({ zip, area: saved.area || '', places: saved.places || [], searched_at: saved.searched_at, saved: true });
      return Response.json({ error: "You've searched a few ZIP codes today. Try again tomorrow." }, { status: 429 });
    }

    const found = await search(zip);
    const searched_at = new Date().toISOString();
    await db.LocalHelpCache.create({ zip, area: found.area, places: found.places, searched_at, family_id: familyId });
    return Response.json({ zip, ...found, searched_at, saved: false });
  } catch (error) {
    console.error('[localHelp]', (error as Error)?.message || error);
    return Response.json({ error: "Couldn't search right now. Try again in a bit." }, { status: 500 });
  }
});

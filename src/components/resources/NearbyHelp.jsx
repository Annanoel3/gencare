import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, MapPin, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Help near the person: type a ZIP, get real local places from a web search
// (functions/localHelp). Results for a ZIP are saved for every family for
// about 6 months, so opening the page again only shows the saved list.
const LABELS = {
  aging: 'Area Agency on Aging', respite: 'Breaks for caregivers', equipment: 'Equipment',
  support: 'Support group', meals: 'Meals', rides: 'Rides', kids: 'Kids', other: 'Other',
};
const ORDER = Object.keys(LABELS);

async function call(body) {
  const res = await base44.functions.invoke('localHelp', body);
  const data = res?.data || res;
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function NearbyHelp({ Entry }) {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  // Opening the page: the saved list for this person's ZIP, if there is one.
  useEffect(() => {
    let live = true;
    call({ peek: true }).then((d) => {
      if (!live || !d?.zip) return;
      setZip(d.zip);
      if (d.places?.length) setResult(d);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const search = async (e) => {
    e?.preventDefault?.();
    const z = zip.replace(/\D/g, '').slice(0, 5);
    if (z.length !== 5) { setError('Enter a 5-digit ZIP code.'); return; }
    setBusy(true); setError('');
    try {
      const d = await call({ zip: z });
      setResult(d); setEditing(false);
      if (!d.places?.length) setError("We couldn't find local places for that ZIP code. The numbers below still work anywhere.");
    } catch (err) {
      setError(err?.message || "Couldn't search right now. Try again in a bit.");
    } finally { setBusy(false); }
  };

  const places = [...(result?.places || [])].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  const showForm = !result?.places?.length || editing;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
      <p className="font-semibold text-sm flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" /> Places near you</p>
      {showForm ? (
        <form onSubmit={search} className="mt-1.5">
          <p className="text-sm text-muted-foreground">Want local help? Type your ZIP code and we'll look up your Area Agency on Aging, adult day and respite care, equipment loan closets, support groups, meals and rides.</p>
          <div className="flex gap-2 mt-2.5">
            <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoComplete="postal-code" placeholder="ZIP code" className="w-32 bg-card" aria-label="ZIP code" />
            <Button type="submit" disabled={busy} className="rounded-xl gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {busy ? 'Looking…' : 'Search'}</Button>
          </div>
          {busy && <p className="text-xs text-muted-foreground mt-2">Searching the web for your area. This can take up to a minute.</p>}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground mt-0.5">
          Near {result.zip}{result.area ? ` · ${result.area}` : ''}{' '}
          <button type="button" onClick={() => setEditing(true)} className="text-primary font-medium">Change</button>
        </p>
      )}
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      {!showForm && places.length > 0 && (
        <>
          <div className="space-y-2.5 mt-3">
            {places.map((p) => (
              <Entry key={p.name} r={{ name: p.name, description: p.description, url: p.url, phones: p.phone ? [{ number: p.phone }] : [], hours: [LABELS[p.category] || '', p.city].filter(Boolean).join(' · ') }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Found by searching the web{result.searched_at ? ` on ${format(new Date(result.searched_at), 'MMM d, yyyy')}` : ''}. Places, hours and phone numbers change, and a search can get things wrong, so call before you go.
          </p>
        </>
      )}
    </div>
  );
}

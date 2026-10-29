import React, { useState } from 'react';
import { LifeBuoy, Phone, ExternalLink, ChevronDown } from 'lucide-react';
import { RESOURCE_GROUPS, RESOURCES_CHECKED } from '@/lib/resources';
import SupportDialog from '@/components/shared/SupportDialog';
import { externalClick } from '@/lib/phone';
import NearbyHelp from '@/components/resources/NearbyHelp';

// Resources: real organizations that help families caring for each other —
// finding local help, support for the caregiver, help for an older adult,
// free or low-cost equipment and supplies, kids and parents. Each section
// opens and closes, so every section is visible at a glance. Tap to call or
// open the site. Every section starts closed. The list lives in
// lib/resources.js with when it was checked; people can suggest more (sent to
// the owner's inbox). "Find help near you" also looks up places for a ZIP
// code (components/resources/NearbyHelp).
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

function Entry({ r }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <p className="font-semibold text-sm">{r.name}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>
      {r.hours && <p className="text-xs text-muted-foreground mt-1">{r.hours}</p>}
      <div className="flex flex-wrap gap-2 mt-2.5">
        {(r.phones || []).map((p) => (
          <a key={p.number} href={telHref(p.number)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Phone className="w-3.5 h-3.5" /> {p.label ? `${p.label}: ` : ''}{p.number}
          </a>
        ))}
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" onClick={externalClick(r.url)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium">
            <ExternalLink className="w-3.5 h-3.5" /> Website
          </a>
        )}
      </div>
    </div>
  );
}

export default function Resources() {
  const [open, setOpen] = useState(() => new Set());
  const [suggest, setSuggest] = useState(false);
  const toggle = (k) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="pb-24 lg:pb-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><LifeBuoy className="w-7 h-7 text-primary" /> Resources</h1>
        <p className="text-muted-foreground mt-1">Free and low-cost help for families caring for each other. Tap a number to call.</p>
      </div>

      <div className="space-y-3">
        {RESOURCE_GROUPS.map((g) => {
          const isOpen = open.has(g.key);
          return (
            <section key={g.key} className="rounded-2xl border border-border/50 bg-card/60">
              <button type="button" onClick={() => toggle(g.key)} className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isOpen}>
                <span className="text-xl" aria-hidden>{g.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-heading font-semibold">{g.title}</span>
                  <span className="block text-xs text-muted-foreground">{g.blurb}</span>
                </span>
                <span className="text-xs text-muted-foreground">{g.items.length}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2.5">
                  {g.key === 'local' && <NearbyHelp Entry={Entry} />}
                  {g.items.map((r) => <Entry key={r.name} r={r} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button type="button" onClick={() => setSuggest(true)} className="mt-5 text-sm text-primary font-medium hover:underline">
        Have a resource you think would be handy? Let us know.
      </button>

      <p className="text-xs text-muted-foreground mt-4">Checked {RESOURCES_CHECKED}. Programs and phone numbers change, and GenCare isn't connected to any of these groups. In an emergency, call 911.</p>

      <SupportDialog open={suggest} onClose={() => setSuggest(false)} kind="resource" />
    </div>
  );
}

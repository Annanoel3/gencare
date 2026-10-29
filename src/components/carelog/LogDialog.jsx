import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { MOODS, nowLocal, pretty, typeDef, CATALOG, bandOf } from '@/lib/careLog';
import { uploadPhoto } from '@/lib/journal';
import PrivateImage from '@/components/journal/PrivateImage';

function toLocal(iso) {
  if (!iso) return nowLocal();
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Log or edit one care entry. The fields come from the catalog for the
 * person's band and the chosen type, so this one dialog serves every age.
 */
export default function LogDialog({ open, onOpenChange, member, entry, type, preset, onSave, onDelete, saving }) {
  const band = bandOf(member);
  const types = CATALOG[band] || CATALOG.general;
  const [entryType, setEntryType] = useState(type || types[0]?.type);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);
  const editing = !!entry?.id;
  const def = typeDef(band, entryType);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    const t = entry?.entry_type || type || types[0]?.type;
    setEntryType(t);
    const d = typeDef(band, t);
    const base = { timestamp: toLocal(entry?.timestamp), photos: [] };
    for (const f of d.fields) {
      if (f.kind === 'select') base[f.key] = entry?.[f.key] || f.options[0];
      else if (f.kind === 'toggle') base[f.key] = !!entry?.[f.key];
      else if (f.kind === 'side') base[f.key] = entry?.[f.key] || 'left';
      else if (f.kind === 'photos') base[f.key] = Array.isArray(entry?.[f.key]) ? entry[f.key] : [];
      else base[f.key] = entry?.[f.key] ?? '';
    }
    // A one-tap button that asks for details starts with its own picks (Bottle, Fall).
    if (!entry && preset) for (const [k, v] of Object.entries(preset)) if (k !== 'entry_type' && k in base) base[k] = v;
    setForm(base);
  }, [open, entry, type, member?.id, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching type on a new entry resets the type-specific fields but keeps the time.
  const switchType = (t) => {
    setEntryType(t);
    const d = typeDef(band, t);
    setForm((f) => {
      const base = { timestamp: f.timestamp, photos: [] };
      for (const fld of d.fields) base[fld.key] = fld.kind === 'select' ? fld.options[0] : fld.kind === 'toggle' ? false : fld.kind === 'side' ? 'left' : fld.kind === 'photos' ? [] : '';
      return base;
    });
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const uris = [];
      for (const f of files.slice(0, 6)) { const u = await uploadPhoto(f); if (u) uris.push(u); }
      set('photos', [...(form.photos || []), ...uris]);
    } catch (err) {
      toast({ title: "Couldn't add the photo", description: err?.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const required = def.fields.filter((f) => f.required && (!f.when || f.when(form)));
  const valid = member && required.every((f) => String(form[f.key] || '').trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? `${def.icon} ${def.label}` : `Log for ${member?.name?.split(' ')[0] || ''}`}</DialogTitle>
          <DialogDescription className="sr-only">Care log entry</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {!editing && (
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button key={t.type} type="button" onClick={() => switchType(t.type)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${entryType === t.type ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )}
          {def.hint && <p className="text-xs text-muted-foreground">{def.hint}</p>}

          {def.fields.filter((f) => !f.when || f.when(form)).map((f) => <Field key={f.key} f={f} value={form[f.key]} onChange={(v) => set(f.key, v)} uploading={uploading} fileRef={fileRef} pickFiles={pickFiles} />)}

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp || ''} onChange={(e) => set('timestamp', e.target.value)} className="mt-1" />
          </div>

          {editing && entry.logged_by_name && <p className="text-xs text-muted-foreground">Logged by {entry.logged_by_name}</p>}

          <div className="flex items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onSave(form, def)} disabled={!valid || saving || uploading}>{saving ? 'Saving…' : editing ? 'Save' : 'Log it'}</Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>It goes for everyone in the family. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(entry)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Field({ f, value, onChange, uploading, fileRef, pickFiles }) {
  switch (f.kind) {
    case 'text':
      return <div><Label>{f.label}{f.required ? ' *' : ''}</Label><Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} className="mt-1" /></div>;
    case 'url':
      return <div><Label>{f.label}</Label><Input type="url" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://…" className="mt-1" /></div>;
    case 'textarea':
      return <div><Label>{f.label}</Label><Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1" /></div>;
    case 'number': case 'minutes': case 'money':
      return (
        <div>
          <Label>{f.label}{f.unit && f.kind !== 'money' ? ` (${f.unit})` : ''}</Label>
          <div className="relative mt-1">
            {f.kind === 'money' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>}
            <Input type="number" inputMode="decimal" min="0" step={f.step || (f.kind === 'money' ? '0.01' : '1')} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={f.kind === 'money' ? 'pl-7' : ''} />
          </div>
        </div>
      );
    case 'select':
      return (
        <div>
          <Label>{f.label}</Label>
          <Select value={value || f.options[0]} onValueChange={onChange}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{(value && !f.options.includes(value) ? [value, ...f.options] : f.options).map((o) => <SelectItem key={o} value={o}>{pretty(o)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    case 'side':
      return (
        <div>
          <Label>{f.label}</Label>
          <div className="flex gap-1.5 mt-1">{['left', 'right', 'both'].map((s) => <button key={s} type="button" onClick={() => onChange(s)} className={`rounded-full border px-3 py-1 text-xs font-medium ${value === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{pretty(s)}</button>)}</div>
        </div>
      );
    case 'date':
      return <div><Label>{f.label}</Label><Input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1" /></div>;
    case 'time':
      return <div><Label>{f.label}</Label><Input type="time" value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1" /></div>;
    case 'mood':
      return (
        <div>
          <Label>{f.label}</Label>
          <div className="flex gap-1.5 mt-1">{MOODS.map((m) => <button key={m.value} type="button" onClick={() => onChange(value === m.value ? '' : m.value)} title={pretty(m.value)} className={`h-10 w-10 rounded-full text-xl border ${value === m.value ? 'bg-primary/15 border-primary scale-110' : 'bg-card border-border'}`}>{m.emoji}</button>)}</div>
        </div>
      );
    case 'level':
      return (
        <div>
          <Label>{f.label}</Label>
          <div className="flex gap-1.5 mt-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => onChange(value === n ? '' : n)} className={`h-9 w-9 rounded-full border text-sm font-medium ${Number(value) === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{n}</button>)}</div>
        </div>
      );
    case 'toggle':
      return <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><Label>{f.label}</Label><Switch checked={!!value} onCheckedChange={onChange} /></div>;
    case 'photos':
      return (
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickFiles} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5">{uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Add photo</Button>
          {(value || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {value.map((uri) => (
                <div key={uri} className="relative">
                  <PrivateImage fileUri={uri} className="w-20 h-20 rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => onChange(value.filter((u) => u !== uri))} aria-label="Remove photo" className="absolute -top-1.5 -right-1.5 bg-foreground text-background rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    default: return null;
  }
}

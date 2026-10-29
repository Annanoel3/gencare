import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { CATEGORIES, MOODS, todayStr, uploadPhoto } from '@/lib/journal';
import PrivateImage from './PrivateImage';

const NOBODY = '__family__';

function blank(memberId) {
  return { content: '', category: 'Observation', mood: '', family_member_id: memberId || '', is_important: false, entry_date: todayStr(), photos: [] };
}

/** Write or edit a journal entry. */
export default function EntryDialog({ open, onOpenChange, entry, members = [], defaultMemberId, onSave, onDelete, saving }) {
  const [form, setForm] = useState(blank());
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);
  const editing = !!entry?.id;

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (entry) {
      setForm({
        ...blank(), ...entry,
        mood: entry.mood || '',
        family_member_id: entry.family_member_id || '',
        entry_date: entry.entry_date || (entry.created_date ? entry.created_date.slice(0, 10) : todayStr()),
        photos: Array.isArray(entry.photos) ? entry.photos : (entry.photo_url ? [entry.photo_url] : []),
      });
    } else setForm(blank(defaultMemberId));
  }, [open, entry, defaultMemberId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const uris = [];
      for (const f of files.slice(0, 6)) {
        const uri = await uploadPhoto(f);
        if (uri) uris.push(uri);
      }
      set('photos', [...form.photos, ...uris]);
    } catch (err) {
      toast({ title: "Couldn't add the photo", description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? 'Journal entry' : 'New journal entry'}</DialogTitle>
          <DialogDescription className="sr-only">Write a note about how someone is doing</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>About</Label>
              <Select value={form.family_member_id || NOBODY} onValueChange={(v) => set('family_member_id', v === NOBODY ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Who is this about?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>The whole family</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Day</Label>
              <Input type="date" value={form.entry_date} max={todayStr()} onChange={(e) => set('entry_date', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Kind of note</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => set('category', c.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${form.category === c.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
                  {c.icon} {c.value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Entry *</Label>
            <Textarea value={form.content} onChange={(e) => set('content', e.target.value)} placeholder="What happened, what you noticed, what was said…" className="mt-1 min-h-[140px]" autoFocus={!editing} />
          </div>

          <div>
            <Label>How they seemed <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex gap-1.5 mt-1">
              {MOODS.map((m) => (
                <button key={m.value} type="button" onClick={() => set('mood', form.mood === m.value ? '' : m.value)} aria-label={m.label} title={m.label}
                  className={`h-10 w-10 rounded-full text-xl border transition-all ${form.mood === m.value ? 'bg-primary/15 border-primary scale-110' : 'bg-card border-border'}`}>
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickFiles} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Add photo
              </Button>
              <button type="button" onClick={() => set('is_important', !form.is_important)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${form.is_important ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-card border-border text-muted-foreground'}`}>
                <Star className={`w-3.5 h-3.5 ${form.is_important ? 'fill-amber-500 text-amber-500' : ''}`} /> Important
              </button>
            </div>
            {form.photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.photos.map((uri) => (
                  <div key={uri} className="relative">
                    <PrivateImage fileUri={uri} className="w-20 h-20 rounded-lg object-cover border border-border" />
                    <button type="button" onClick={() => set('photos', form.photos.filter((u) => u !== uri))} aria-label="Remove photo"
                      className="absolute -top-1.5 -right-1.5 bg-foreground text-background rounded-full p-0.5"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing && entry.author_name && (
            <p className="text-xs text-muted-foreground">Written by {entry.author_name}{entry.created_date ? ` · ${new Date(entry.created_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> Delete</Button>}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={!form.content.trim() || saving || uploading}>{saving ? 'Saving…' : editing ? 'Save' : 'Add entry'}</Button>
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

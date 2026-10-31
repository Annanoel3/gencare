import React, { useEffect, useState } from 'react';
import { Users, UserCheck, Lock, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const nameOf = (u) => String(u?.display_name || u?.full_name || u?.email || 'Someone').trim();
const firstOf = (u) => nameOf(u).split(' ')[0];

/** "Shared with the family" / "Shared with Sam and Lee" / "Only you". */
export function sharingLabel(record, accounts = []) {
  if (record?.shared_with_family === true) return 'Shared with the family';
  const ids = Array.isArray(record?.shared_with) ? record.shared_with : [];
  const names = ids.map((id) => accounts.find((a) => a.id === id)).filter(Boolean).map(firstOf);
  if (!names.length) return 'Only you';
  if (names.length <= 2) return `Shared with ${names.join(' and ')}`;
  return `Shared with ${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * "Share these notes?" (Anna, Oct 30 2026): notes never go to the family on
 * their own. Right after they're made (and from the sharing button later) the
 * person who recorded them picks: the whole family, certain people, or
 * nobody. Whoever it's newly shared with gets a push that opens the notes.
 *
 * others: the family's other accounts. onSave({ everyone, ids }) / onNotNow().
 */
export default function ShareNotesDialog({ open, record, others = [], first = false, onSave, onNotNow }) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    if (!open) return;
    const ids = Array.isArray(record?.shared_with) ? record.shared_with : [];
    setPicked(ids.filter((id) => others.some((o) => o.id === id)));
    setPicking(!record?.shared_with_family && ids.length > 0);
    setSaving('');
  }, [open, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (kind, value) => {
    setSaving(kind);
    try { await onSave(value); } finally { setSaving(''); }
  };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const shared = record?.shared_with_family === true || (Array.isArray(record?.shared_with) && record.shared_with.length > 0);
  const about = record?.family_member_name ? ` about ${String(record.family_member_name).split(' ')[0]}` : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onNotNow(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>{first ? 'Your notes are ready. Share them?' : 'Who can see these notes?'}</DialogTitle>
          <DialogDescription>
            {shared ? sharingLabel(record, others) + '.' : `Only you can see the notes${about} right now.`} Anyone you share them with gets a notification that opens them.
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody else in your family is on GenCare yet. Once they join, you can share these from the notes.</p>
        ) : (
          <div className="space-y-2">
            <Button className="w-full h-12 rounded-xl justify-start gap-2" disabled={!!saving} onClick={() => save('all', { everyone: true, ids: [] })}>
              {saving === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Share with the whole family
            </Button>
            {!picking ? (
              <Button variant="outline" className="w-full h-12 rounded-xl justify-start gap-2" disabled={!!saving} onClick={() => setPicking(true)}>
                <UserCheck className="w-4 h-4" /> Pick who sees them
              </Button>
            ) : (
              <div className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-sm font-medium">Pick who sees them</p>
                {others.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 py-1.5 text-[15px]">
                    <Checkbox checked={picked.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
                    {nameOf(u)}
                  </label>
                ))}
                <Button className="w-full h-11 rounded-xl" disabled={!picked.length || !!saving} onClick={() => save('some', { everyone: false, ids: picked })}>
                  {saving === 'some' ? <Loader2 className="w-4 h-4 animate-spin" /> : picked.length ? `Share with ${picked.length === 1 ? firstOf(others.find((o) => o.id === picked[0])) : `${picked.length} people`}` : 'Pick at least one person'}
                </Button>
              </div>
            )}
            {shared && (
              <Button variant="ghost" className="w-full h-11 rounded-xl justify-start gap-2 text-muted-foreground" disabled={!!saving} onClick={() => save('none', { everyone: false, ids: [] })}>
                {saving === 'none' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Stop sharing (only me)
              </Button>
            )}
          </div>
        )}

        <Button variant="ghost" className="w-full rounded-xl" disabled={!!saving} onClick={onNotNow}>{first ? 'Not now' : 'Done'}</Button>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useFamily, claimProfile } from '@/lib/family';
import { isNativeApp } from '@/lib/phone';
import { wasAsked, onPermissionAnswered } from '@/lib/notifyPermission';

const declinedKey = (userId) => `gencare_profile_declined_${userId}`;
function readDeclined(userId) {
  try { return new Set(JSON.parse(localStorage.getItem(declinedKey(userId)) || '[]')); } catch (e) { return new Set(); }
}

/**
 * "Is one of these you?" For someone who joined without their profile's own
 * invite (the family's general code, or a sign-up name that didn't match the
 * profile exactly): the profiles someone else made that nobody uses yet, so
 * they can say which is theirs. "None of these" isn't asked again for those
 * same profiles. Waits for the phone's notification question, so two popups
 * are never up at once.
 */
export default function ClaimProfilePrompt() {
  const { me, members: accounts, refresh } = useFamily();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState('');
  const [closed, setClosed] = useState(false);
  const [permissionDone, setPermissionDone] = useState(() => !isNativeApp() || wasAsked());
  useEffect(() => (permissionDone ? undefined : onPermissionAnswered(() => setPermissionDone(true))), [permissionDone]);

  const { data: profiles = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
    enabled: !!me?.id,
  });

  const candidates = useMemo(() => {
    if (!me?.id || profiles.some((p) => p.linked_user_id === me.id)) return [];
    const declined = readDeclined(me.id);
    return profiles.filter((p) => !p.linked_user_id && p.is_active !== false && !declined.has(p.id) && !/^pet$/i.test(String(p.relationship || ''))
      && (p.created_by_user_id || p.created_by_id) && (p.created_by_user_id || p.created_by_id) !== me.id);
  }, [profiles, me?.id]);

  const madeBy = (p) => {
    const u = (accounts || []).find((a) => a.id === (p.created_by_user_id || p.created_by_id));
    const who = u ? String(u.full_name || u.email || '').split(' ')[0] : '';
    return who && p.relationship ? `${who}'s ${String(p.relationship).toLowerCase()}` : p.relationship || '';
  };

  const pick = async (p) => {
    setBusy(p.id);
    try {
      await claimProfile(p.id);
      toast({ title: `${p.name} is now your profile` });
      queryClient.invalidateQueries({ queryKey: ['familyMembers'] });
      refresh?.();
      setClosed(true);
    } catch (e) {
      toast({ title: 'Could not do that', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const none = () => {
    try {
      const d = readDeclined(me.id);
      candidates.forEach((p) => d.add(p.id));
      localStorage.setItem(declinedKey(me.id), JSON.stringify([...d]));
    } catch (e) { /* asked again next time */ }
    setClosed(true);
  };

  const open = !closed && permissionDone && candidates.length > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) setClosed(true); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Is one of these you?</DialogTitle>
          <DialogDescription>Your family made {candidates.length === 1 ? 'a profile that might be yours' : 'profiles, and one might be yours'}. Pick yours so it's linked to you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!!busy}
              onClick={() => pick(p)}
              className="w-full flex items-center gap-3 rounded-xl border-2 border-border hover:bg-muted p-3 text-left"
            >
              <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">{p.name}</span>
                {madeBy(p) && <span className="block text-xs text-muted-foreground">{madeBy(p)}</span>}
              </span>
              {busy === p.id && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={none} disabled={!!busy}>None of these are me</Button>
      </DialogContent>
    </Dialog>
  );
}

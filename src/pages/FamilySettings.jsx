import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, QrCode, Bell, CreditCard, LogOut, Pencil, Check, Loader2, Smartphone, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { useFamily, renameFamily, removeMember, leaveFamily } from '@/lib/family';
import InviteModal from '@/components/family/InviteModal';
import PhoneCalendarSheet from '@/components/calendar/PhoneCalendarSheet';
import { SharingOptions, useSharingChoice } from '@/components/calendar/SharingChoice';
import { sharingDefaultOf } from '@/lib/events';
import { useQuery } from '@tanstack/react-query';
import { isNativeApp } from '@/lib/phone';

// Your family (the household): its name, who's in it, invites, the plan, and
// this person's own notification choices.
export default function FamilySettings() {
  const { family, me, members, access, refresh, apply } = useFamily();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const sharing = useSharingChoice(() => refresh?.());
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(family?.name || '');
  const [busy, setBusy] = useState('');
  const [prefs, setPrefs] = useState({
    push_enabled: me?.push_enabled !== false,
    notify_family_events: me?.notify_family_events !== false,
    notify_reminders: me?.notify_reminders !== false,
  });

  const { data: people = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const isOwner = me?.family_role === 'owner' || me?.role === 'admin';

  const saveName = async () => {
    if (!name.trim()) return;
    setBusy('name');
    try {
      const fam = await renameFamily(name.trim());
      apply({ family: fam });
      setEditingName(false);
    } catch (e) { toast({ title: 'Could not rename', description: e?.message, variant: 'destructive' }); }
    setBusy('');
  };

  const setPref = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { await base44.auth.updateMe({ [key]: value }); } catch (e) { toast({ title: 'Could not save', description: e?.message, variant: 'destructive' }); }
  };

  const testPush = async () => {
    setBusy('test');
    try {
      const r = await base44.functions.invoke('notifyFamily', { kind: 'test' });
      const d = r?.data || r;
      if (d?.ok && d.recipients > 0) toast({ title: 'Sent', description: 'A test notification is on its way to this phone.' });
      else toast({ title: 'No phone got it', description: d?.error || 'This account has no phone with notifications on yet. Open GenCare on your phone and allow notifications.', variant: 'destructive' });
    } catch (e) { toast({ title: 'Could not send', description: e?.message, variant: 'destructive' }); }
    setBusy('');
  };

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.full_name} from ${family?.name}? They'll get an empty family of their own.`)) return;
    setBusy(u.id);
    try { await removeMember(u.id); await refresh(); } catch (e) { toast({ title: 'Could not remove', description: e?.message, variant: 'destructive' }); }
    setBusy('');
  };

  const leave = async () => {
    if (!window.confirm(`Leave ${family?.name}? You'll start a new, empty family. Everything shared stays with the family.`)) return;
    setBusy('leave');
    try { const d = await leaveFamily(); apply(d); } catch (e) { toast({ title: 'Could not leave', description: e?.message, variant: 'destructive' }); }
    setBusy('');
  };

  const planLine = access?.reason === 'subscribed' ? 'GenCare Family — active'
    : access?.reason === 'trial' ? `Free week — ${Math.max(0, Math.ceil((Date.parse(access.until) - Date.now()) / 86400e3))} days left`
    : access?.reason === 'promo' ? 'Free access' : access?.reason === 'owner' ? 'App owner' : 'No plan — free week is over';

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><Users className="w-7 h-7 text-primary" /> My Family</h1>
        <p className="text-muted-foreground mt-1">Who shares this calendar, and what reaches your phone.</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Name + members */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            {editingName ? (
              <div className="flex items-center gap-2 flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" autoFocus />
                <Button size="icon" onClick={saveName} disabled={busy === 'name'}>{busy === 'name' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}</Button>
              </div>
            ) : (
              <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                {family?.name}
                {isOwner && <button type="button" onClick={() => { setName(family?.name || ''); setEditingName(true); }} className="text-muted-foreground"><Pencil className="w-4 h-4" /></button>}
              </h2>
            )}
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)} className="gap-2"><QrCode className="w-4 h-4" /> Invite</Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">People with accounts who see this family's calendar, tasks and logs. (The people you care for are under Family Members.)</p>
          <div className="space-y-2">
            {members.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">{(u.full_name || '?').charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name}{u.id === me?.id ? ' (you)' : ''}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.family_role === 'owner' ? 'Owner' : 'Member'} · {u.email}</p>
                </div>
                {isOwner && u.id !== me?.id && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(u)} disabled={busy === u.id}>Remove</Button>
                )}
              </div>
            ))}
          </div>
          {!isOwner && (
            <Button variant="ghost" size="sm" className="mt-3 text-destructive gap-2" onClick={leave} disabled={busy === 'leave'}><LogOut className="w-4 h-4" /> Leave this family</Button>
          )}
        </div>

        {/* Plan */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Plan</h2>
              <p className="text-xs text-muted-foreground">{planLine}</p>
            </div>
          </div>
          <Link to="/subscribe"><Button variant="outline" size="sm">{access?.reason === 'subscribed' ? 'Manage plan' : 'See the plan'}</Button></Link>
        </div>

        {/* Notifications */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><Bell className="w-5 h-5 text-accent" /></div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Notifications</h2>
              <p className="text-xs text-muted-foreground">What reaches your phone. Everyone in the family picks their own.</p>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">Notifications on</span>
              <Switch checked={prefs.push_enabled} onCheckedChange={(v) => setPref('push_enabled', !!v)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">When someone adds or changes a family event, task or message</span>
              <Switch checked={prefs.notify_family_events} disabled={!prefs.push_enabled} onCheckedChange={(v) => setPref('notify_family_events', !!v)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">Reminders before appointments, due tasks, and the 7 AM "today" summary</span>
              <Switch checked={prefs.notify_reminders} disabled={!prefs.push_enabled} onCheckedChange={(v) => setPref('notify_reminders', !!v)} />
            </label>
            <Button variant="outline" size="sm" onClick={testPush} disabled={busy === 'test'} className="gap-2 mt-1"><Send className="w-4 h-4" /> Send me a test notification</Button>
          </div>
        </div>

        {/* Who sees the events you add */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <h2 className="font-heading text-lg font-semibold">Who sees the events you add</h2>
          <p className="text-xs text-muted-foreground mb-3">For events you add and ones from your phone calendar. You can still change any single event.</p>
          <SharingOptions value={sharingDefaultOf(me)} onPick={sharing.pick} busy={sharing.busy} />
        </div>

        {/* Phone calendar */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Smartphone className="w-5 h-5 text-blue-500" /></div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Phone calendar</h2>
              <p className="text-xs text-muted-foreground">{isNativeApp() ? 'Bring your phone calendars in, and send family events to your phone.' : 'Set this up in the GenCare app on your phone.'}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPhoneOpen(true)}>Set up</Button>
        </div>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <PhoneCalendarSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} members={people} />
    </div>
  );
}

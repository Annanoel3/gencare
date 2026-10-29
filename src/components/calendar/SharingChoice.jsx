import React, { useState } from 'react';
import { Sparkles, Users, Lock, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { saveSharingDefault } from '@/lib/calendarSync';

// "Who sees the events you add?" — asked once, the first time someone opens
// the Calendar, and changeable in Settings → My Family. Counts for events
// added in the app and ones brought in from their phone calendar; any single
// event can still be changed on the event.
export const SHARING_OPTIONS = [
  {
    value: 'auto', icon: Sparkles, label: 'Let GenCare decide',
    desc: 'Appointments, school and family plans go to everyone. Things that look personal, like lunch with a friend, stay with you.',
  },
  { value: 'family', icon: Users, label: 'Everyone in the family', desc: 'Everything you add is shared.' },
  { value: 'private', icon: Lock, label: 'Just me', desc: 'Nothing is shared until you share it.' },
];

export function SharingOptions({ value, onPick, busy }) {
  return (
    <div className="space-y-2">
      {SHARING_OPTIONS.map((o) => {
        const Icon = o.icon;
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={!!busy}
            onClick={() => onPick(o.value)}
            className={`w-full flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
          >
            <Icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
            </span>
            {busy === o.value ? <Loader2 className="w-4 h-4 animate-spin text-primary mt-0.5" /> : on ? <Check className="w-4 h-4 text-primary mt-0.5" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Saves the choice; `onSaved` gets the new value. */
export function useSharingChoice(onSaved) {
  const [busy, setBusy] = useState('');
  const pick = async (value) => {
    setBusy(value);
    try {
      await saveSharingDefault(value);
      onSaved?.(value);
    } catch (e) {
      toast({ title: 'Could not save that', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(''); }
  };
  return { busy, pick };
}

// Closed without a choice: asked again on the next visit to the Calendar.
export default function SharingChoiceDialog({ open, onSaved, onClose }) {
  const { busy, pick } = useSharingChoice(onSaved);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Who sees the events you add?</DialogTitle>
          <DialogDescription>For events you add here and ones from your phone calendar. You can change any single event, and this choice in Settings.</DialogDescription>
        </DialogHeader>
        <SharingOptions value="" onPick={pick} busy={busy} />
      </DialogContent>
    </Dialog>
  );
}

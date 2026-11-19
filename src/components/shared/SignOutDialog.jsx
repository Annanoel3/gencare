import React, { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/widgets';

// "Sign out of GenCare?" before signing out (testers' report, Nov 2026: a
// tap on Sign out shouldn't log someone out by accident). Used by the menu
// and Settings.
export default function SignOutDialog({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogTitle className="font-heading text-xl">Sign out of GenCare?</DialogTitle>
        <DialogDescription className="text-base text-foreground/80">
          Your family's things stay saved. You'll need to sign in again to see them on this phone.
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full h-12" onClick={onClose} disabled={busy}>Stay signed in</Button>
          <Button
            variant="outline"
            className="w-full h-12 gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
            disabled={busy}
            onClick={() => { setBusy(true); signOut(); }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Sign out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

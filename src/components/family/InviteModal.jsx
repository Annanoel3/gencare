import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { createInvite } from '@/lib/family';
import { plainError } from '@/lib/errors';

// `member` (optional): the profile this invite is for. Whoever joins with it
// becomes that profile, so the family's notes about them stay with them.
export default function InviteModal({ open, onClose, member }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(''); // 'code' | 'link'

  const [error, setError] = useState('');

  // The code is made on the server, tied to this family (functions/family).
  const makeInvite = async () => {
    setLoading(true);
    setError('');
    try {
      setInvite(await createInvite(member?.id));
    } catch (e) {
      setError(plainError(e, "Couldn't make an invite code. Check your connection and try again."));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) makeInvite(); else setInvite(null);
  }, [open, member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinUrl = invite ? `${window.location.origin}/join?code=${invite.code}` : '';

  const copyCode = () => {
    navigator.clipboard.writeText(invite.code);
    setCopied('code');
    setTimeout(() => setCopied(''), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied('link');
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{member ? `Invite ${member.name.split(' ')[0]}` : 'Invite Family Member'}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && <p className="text-sm text-destructive text-center">{error}</p>}

        {invite && !loading && (
          <div className="flex flex-col items-center gap-5">
            <p className="text-sm text-muted-foreground text-center">
              {member
                ? `Send this to ${member.name.split(' ')[0]}. When they join with it, the ${member.name} profile becomes theirs. It expires in 7 days.`
                : 'Share this QR code or code with a family member. It expires in 7 days.'}
            </p>

            <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>

            <div className="w-full bg-muted rounded-xl p-4 flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">Or type this code at {window.location.origin}/join</p>
              <span className="text-3xl font-mono font-bold tracking-widest text-foreground">
                {invite.code}
              </span>
            </div>

            {/* Buttons with words (the copy and new-code buttons were icons only; Anna, Nov 14 2026). */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <Button variant="outline" className="gap-1.5" onClick={copyCode}>
                {copied === 'code' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />} {copied === 'code' ? 'Copied' : 'Copy code'}
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={copyLink}>
                {copied === 'link' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />} {copied === 'link' ? 'Copied' : 'Copy link'}
              </Button>
              <Button variant="outline" className="gap-1.5 col-span-2" onClick={makeInvite}>
                <RefreshCw className="w-4 h-4" /> Make a new code
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
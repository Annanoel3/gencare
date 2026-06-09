import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function InviteModal({ open, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const createInvite = async () => {
    setLoading(true);
    const user = await base44.auth.me();
    const code = generateCode();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const newInvite = await base44.entities.Invite.create({
      code,
      family_name: user?.full_name ? `${user.full_name}'s Family` : 'My Family',
      created_by_name: user?.full_name || '',
      expires_at: expires,
      is_active: true,
      uses_count: 0,
    });
    setInvite(newInvite);
    setLoading(false);
  };

  useEffect(() => {
    if (open) createInvite();
  }, [open]);

  const joinUrl = invite ? `${window.location.origin}/join?code=${invite.code}` : '';

  const copyCode = () => {
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite Family Member</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {invite && !loading && (
          <div className="flex flex-col items-center gap-5">
            <p className="text-sm text-muted-foreground text-center">
              Share this QR code or code with a family member. It expires in 7 days.
            </p>

            <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>

            <div className="w-full bg-muted rounded-xl p-4 flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">Or type this code at {window.location.origin}/join</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold tracking-widest text-foreground">
                  {invite.code}
                </span>
                <Button size="icon" variant="ghost" onClick={copyCode}>
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={copyLink}>
                Copy Link
              </Button>
              <Button variant="outline" size="icon" onClick={createInvite}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
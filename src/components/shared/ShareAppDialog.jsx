import React, { useState } from 'react';
import { Check, Copy, Mail, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { isIPhoneApp } from '@/lib/phone';
import { shareLinks, shareMessage } from '@/lib/storeLinks';

// Share GenCare (testers' report, Nov 2026): a text, an email, or the link
// copied. Three plain choices instead of the phone's share sheet, which the
// Android app can't open without a new build.
export default function ShareAppDialog({ open, onClose }) {
  const [copied, setCopied] = useState(false);
  const message = shareMessage();
  const body = encodeURIComponent(message);
  // iPhone's Messages takes "sms:&body=", Android's "sms:?body=".
  const sms = isIPhoneApp() ? `sms:&body=${body}` : `sms:?body=${body}`;
  const mail = `mailto:?subject=${encodeURIComponent('GenCare, for keeping family care organized')}&body=${body}`;
  const copy = async () => {
    const text = shareLinks().map((l) => l.url).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 3000); } catch (e) { /* nothing to do */ }
  };
  const row = 'w-full flex items-center gap-3 h-14 px-4 rounded-xl border-2 border-border text-base font-medium hover:bg-muted';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogTitle className="font-heading text-xl">Share GenCare</DialogTitle>
        <DialogDescription className="text-base text-foreground/80">Send someone a link to get GenCare.</DialogDescription>
        <div className="flex flex-col gap-2 pt-1">
          <a href={sms} className={row} onClick={onClose}><MessageSquare className="w-5 h-5 text-primary" /> Send a text</a>
          <a href={mail} className={row} onClick={onClose}><Mail className="w-5 h-5 text-primary" /> Send an email</a>
          <button type="button" className={row} onClick={copy}>
            {copied ? <Check className="w-5 h-5 text-primary" /> : <Copy className="w-5 h-5 text-primary" />} {copied ? 'Link copied' : 'Copy the link'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

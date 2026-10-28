import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

// "Ask for help" / "Report a bug": one box, sent to the app owner's inbox
// (functions/sendSupportRequest) with the build and page attached.
export default function SupportDialog({ open, onClose, kind = 'support' }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isBug = kind === 'bug';

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('sendSupportRequest', { kind, message: message.trim(), page: window.location.pathname });
      if (!(res?.data || res)?.sent) throw new Error((res?.data || res)?.error || 'not sent');
      toast({ title: isBug ? 'Thanks, the bug report went out' : 'Sent', description: 'You will hear back by email.' });
      setMessage('');
      onClose();
    } catch (e) {
      toast({ title: "Couldn't send that", description: e?.message || 'Check your connection and try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{isBug ? 'Report a bug' : 'Ask for help'}</DialogTitle>
          <DialogDescription>{isBug ? 'What happened, and what you expected instead. The page and app version come along on their own.' : 'A question, a problem, or something GenCare should do better.'}</DialogDescription>
        </DialogHeader>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isBug ? 'I tapped … and then …' : 'How can we help?'} className="min-h-[120px]" autoFocus />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={!message.trim() || busy} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

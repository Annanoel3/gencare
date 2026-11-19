import React, { useState } from 'react';
import MissingNote from '@/components/shared/MissingNote';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { plainError } from '@/lib/errors';

// "Ask for help" / "Report a bug" / "Suggest a resource": one box, sent to
// the app owner's inbox (functions/sendSupportRequest) with the build and page.
const COPY = {
  support: { title: 'Ask for help', desc: 'A question, a problem, or something GenCare should do better.', placeholder: 'How can we help?', done: 'Sent', doneDesc: 'You will hear back by email.' },
  bug: { title: 'Report a bug', desc: 'What happened, and what you expected instead. The page and app version come along on their own.', placeholder: 'I tapped … and then …', done: 'Thanks, the bug report went out', doneDesc: 'You will hear back by email.' },
  // From the welcome chat (Anna, Nov 18 2026: "let them know they can send questions or suggestions to the developer").
  idea: { title: 'Send a question or idea', desc: 'Ask anything, or tell me what GenCare should do. It goes straight to me, the developer.', placeholder: 'Your question or idea', done: 'Sent. Thank you!', doneDesc: 'You will hear back by email.' },
  resource: { title: 'Suggest a resource', desc: "Know a group or program that helps families like yours? Tell us and we'll look into adding it.", placeholder: 'Its name, website or phone, and what it helps with', done: 'Thanks for the suggestion', doneDesc: "We'll check it out." },
};
export default function SupportDialog({ open, onClose, kind = 'support' }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Send says what's missing when tapped empty (it used to sit pale; Anna, Nov 14 2026).
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) setMissing(false); }
  const c = COPY[kind] || COPY.support;

  const send = async () => {
    if (busy) return;
    if (!message.trim()) { setMissing(true); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke('sendSupportRequest', { kind, message: message.trim(), page: window.location.pathname });
      if (!(res?.data || res)?.sent) throw new Error((res?.data || res)?.error || 'not sent');
      toast({ title: c.done, description: c.doneDesc });
      setMessage('');
      onClose();
    } catch (e) {
      toast({ title: "Couldn't send that", description: plainError(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{c.title}</DialogTitle>
          <DialogDescription>{c.desc}</DialogDescription>
        </DialogHeader>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={c.placeholder} className="min-h-[120px]" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy} className="gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send</Button>
        </div>
        <MissingNote text={missing && !message.trim() ? 'Write your question or problem first.' : ''} className="-mt-2" />
      </DialogContent>
    </Dialog>
  );
}

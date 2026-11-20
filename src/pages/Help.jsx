import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp, LifeBuoy, PlayCircle, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SupportDialog from '@/components/shared/SupportDialog';
import { startTour } from '@/components/onboarding/AppTour';
import { GUIDES, startGuide } from '@/components/help/guides';

// Help (Anna, Nov 18 2026: for the older generations). Nov 20 2026: the
// written steps went ("just a lot of text and it expects the user to remember
// all the steps and return to the page they were confused about"). Each
// "Show me" now walks the person through it on the real screens
// (components/help/guides.jsx), and "Ask a question or submit feedback" opens
// a chat that knows the app (pages/HelpChat.jsx). Opened from the menu.
export default function Help() {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  return (
    <div className="pb-24 lg:pb-8 max-w-2xl">
      <div className="mb-5">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <CircleHelp className="w-7 h-7 text-primary" />
          Help
        </h1>
        <p className="text-muted-foreground mt-1 text-base">Tap <b>Show me</b> and GenCare walks you through it, one tap at a time.</p>
      </div>

      <Button onClick={() => navigate('/help/ask')} className="w-full h-14 gap-2 text-base rounded-2xl mb-3">
        <MessageSquareText className="w-5 h-5" /> Ask a question or submit feedback
      </Button>
      <Button onClick={startTour} variant="outline" className="w-full h-14 gap-2 text-base rounded-2xl mb-6 border-2 border-primary/30">
        <PlayCircle className="w-5 h-5 text-primary" /> Take the quick tour again
      </Button>

      <h2 className="font-heading text-lg font-semibold mb-2">Show me how</h2>
      <div className="space-y-2">
        {GUIDES.map((g) => (
          <button key={g.id} type="button" onClick={() => startGuide(g.id)}
            className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border/50 p-4 md:px-6 text-left min-h-[3.75rem] hover:bg-muted/40 transition-colors">
            <span className="flex-1 min-w-0 font-heading text-lg font-semibold">{g.title}</span>
            <span className="flex items-center gap-1 text-base font-medium text-primary flex-shrink-0"><PlayCircle className="w-5 h-5" aria-hidden="true" /> Show me</span>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6 mt-6">
        <h2 className="font-heading text-lg font-semibold">Rather write to a person?</h2>
        <p className="text-base text-muted-foreground mt-1 mb-4">Your message goes straight to the person who makes GenCare.</p>
        <Button onClick={() => setAsking(true)} variant="outline" className="w-full h-12 gap-2 text-base"><LifeBuoy className="w-5 h-5" /> Send a message</Button>
      </div>

      <SupportDialog open={asking} kind="support" onClose={() => setAsking(false)} />
    </div>
  );
}

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFamily } from '@/lib/family';
import Subscribe from '@/pages/Subscribe';

// Waits for the family to load (so family_id is known before any screen
// writes), then shows the plan screen when the free week is over. Settings,
// account and legal pages stay reachable either way.
const ALWAYS_OPEN = ['/settings', '/family-settings', '/account-management', '/privacy-policy', '/terms', '/subscribe', '/join'];

export default function FamilyGate({ children }) {
  const { loading, error, hasAccess, refresh } = useFamily();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your family…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <p className="font-medium mb-1">Couldn't load your family</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!hasAccess && !ALWAYS_OPEN.some((p) => location.pathname.startsWith(p))) {
    return <Subscribe gate />;
  }
  return children;
}

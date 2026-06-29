import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CalendarClock, Link2, Unlink, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

export default function GoogleCalendarSync() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getGoogleCalendarEvents', {});
      setEvents(res.data.events || []);
      setConnected(true);
    } catch {
      setConnected(false);
      setEvents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        await fetchData();
      } else {
        setLoading(false);
      }
    });
  }, [fetchData]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, '_blank');
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          setConnecting(false);
          fetchData();
        }
      }, 500);
    } catch {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await base44.connectors.disconnectAppUser(CONNECTOR_ID);
    setConnected(false);
    setEvents([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold">Google Calendar</h3>
            <p className="text-xs text-muted-foreground">
              {connected ? 'Synced with your Google account' : 'Connect to see your Google events here'}
            </p>
          </div>
        </div>
        {connected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2">
            <Unlink className="w-4 h-4" /> Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={connecting} className="gap-2">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
        )}
      </div>
      {connected && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Upcoming Google Events</p>
          {events.length > 0 ? (
            <div className="space-y-2">
              {events.slice(0, 6).map(ev => (
                <div key={ev.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.summary || '(No title)'}</p>
                    {ev.start?.dateTime && (
                      <p className="text-xs text-muted-foreground">{format(parseISO(ev.start.dateTime), 'EEE, MMM d · h:mm a')}</p>
                    )}
                    {ev.start?.date && (
                      <p className="text-xs text-muted-foreground">{format(parseISO(ev.start.date), 'EEE, MMM d')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming Google events.</p>
          )}
        </div>
      )}
    </div>
  );
}
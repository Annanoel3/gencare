import React, { useEffect, useState } from 'react';
import { Smartphone, Download, Upload, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useFamily } from '@/lib/family';
import { isNativeApp } from '@/lib/phone';
import {
  hasPhoneCalendars, listDeviceCalendars, listWritableCalendars, requestReadPermission, requestWritePermission,
  saveCalendarSettings, runImport, runExport, calendarStatus,
} from '@/lib/calendarSync';

const REMINDERS = [
  { v: -1, label: 'No reminder on the phone' },
  { v: 10, label: '10 minutes before' },
  { v: 30, label: '30 minutes before' },
  { v: 60, label: '1 hour before' },
];

// "Phone calendar": two independent halves.
//   Bring in — tick phone calendars to import into GenCare. Imported events
//     come in as "Only me"; you share them one event at a time (open the event,
//     Share with). Never a whole calendar at once. Birthdays stay out.
//   Send to my phone — pick ONE phone calendar GenCare writes into. What lands
//     there is decided per event by whoever adds it ("Share with" on the
//     event): the whole family, certain people, or only themselves.
export default function PhoneCalendarSheet({ open, onClose }) {
  const { me, refresh } = useFamily();
  const [calendars, setCalendars] = useState([]);
  const [writable, setWritable] = useState([]);
  const [granted, setGranted] = useState(false);
  const [writeGranted, setWriteGranted] = useState(false);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');

  const native = isNativeApp() && hasPhoneCalendars();

  const load = async () => {
    const st = await calendarStatus().catch(() => null);
    if (st?.ok) { setSettings(st.settings); setStatus(st); }
    else if (me) setSettings({
      device_calendar_ids: me.device_calendar_ids || [],
      export_enabled: !!me.export_enabled, export_calendar_id: me.export_calendar_id || '',
      export_reminder_minutes: typeof me.export_reminder_minutes === 'number' ? me.export_reminder_minutes : 30,
    });
    if (native) {
      const r = await listDeviceCalendars();
      setGranted(r.granted); setCalendars(r.calendars);
      const w = await listWritableCalendars();
      setWriteGranted(w.granted); setWritable(w.calendars);
    }
  };

  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    setBusy('save');
    try {
      const next = await saveCalendarSettings(patch);
      setSettings(next);
      refresh();
      return next;
    } catch (e) {
      toast({ title: 'Could not save', description: e?.message || 'Try again', variant: 'destructive' });
      return null;
    } finally { setBusy(''); }
  };

  const allowRead = async () => {
    const ok = await requestReadPermission();
    if (!ok) { toast({ title: 'Calendar access was not allowed', description: 'GenCare can only read calendars you allow in your phone settings.' }); return; }
    await load();
  };
  const allowWrite = async () => {
    const ok = await requestWritePermission();
    if (!ok) { toast({ title: 'Calendar access was not allowed', description: 'GenCare needs permission to write to your phone calendar.' }); return; }
    await load();
  };

  const toggleImport = async (id, on) => {
    const ids = new Set(settings.device_calendar_ids || []);
    if (on) ids.add(id); else ids.delete(id);
    const next = await save({ device_calendar_ids: [...ids] });
    if (next && on) {
      setBusy('import');
      try {
        const r = await runImport(next.device_calendar_ids, { force: true });
        if (r?.ok) {
          const n = typeof r.total === 'number' ? r.total : r.created;
          toast({ title: 'Calendar brought in', description: n ? `${n} upcoming event${n === 1 ? '' : 's'} from your phone. Only you see them until you open one and share it.` : 'No upcoming events in that calendar.' });
        }
      } catch (e) {
        toast({ title: 'Could not read that calendar', description: 'Check that GenCare is allowed to read your calendar.', variant: 'destructive' });
      } finally { setBusy(''); }
    }
  };

  const setExport = async (patch) => {
    const next = await save(patch);
    if (next?.export_enabled && next?.export_calendar_id) {
      setBusy('export');
      try { await runExport({ force: true }); } catch (e) { /* the worker tries again */ }
      setBusy('');
      refreshStatus();
    } else if (next && patch.export_enabled === false) {
      // Everything GenCare wrote comes off the phone.
      setBusy('export');
      try { await runExport({ force: true }); } catch (e) { /* the worker tries again */ }
      setBusy('');
      refreshStatus();
    }
  };

  const refreshStatus = async () => {
    const st = await calendarStatus().catch(() => null);
    if (st?.ok) setStatus(st);
  };

  const syncNow = async () => {
    setBusy('sync');
    try {
      if (settings?.device_calendar_ids?.length) await runImport(settings.device_calendar_ids, { force: true });
      if (settings?.export_enabled && settings?.export_calendar_id) await runExport({ force: true });
      await refreshStatus();
      toast({ title: 'Synced' });
    } catch (e) {
      toast({ title: 'Sync did not finish', description: e?.code === 'calendar_permission' ? 'GenCare lost calendar access. Allow it again below.' : (e?.message || 'Try again'), variant: 'destructive' });
    } finally { setBusy(''); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Smartphone className="w-5 h-5" /> Phone calendar</DialogTitle>
          <DialogDescription>Bring your phone's calendars into GenCare, and put the family's events on your phone — only the ones you want.</DialogDescription>
        </DialogHeader>

        {!native ? (
          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            This works in the GenCare app on your phone. Open GenCare on your phone to set it up.
          </div>
        ) : !settings ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {/* Bring in */}
            <section className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Download className="w-4 h-4" /> Bring in from my phone</h3>
              {!granted ? (
                <div className="rounded-xl border border-border p-3 text-sm">
                  <p className="mb-2">GenCare needs permission to read your calendars.</p>
                  <Button size="sm" onClick={allowRead}>Allow calendar access</Button>
                </div>
              ) : calendars.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calendars found on this phone.</p>
              ) : (
                <div className="space-y-2">
                  {calendars.map((c) => {
                    const on = (settings.device_calendar_ids || []).includes(c.id);
                    return (
                      <div key={c.id} className="rounded-xl border border-border p-3">
                        <label className="flex items-center gap-3">
                          <Checkbox checked={on} onCheckedChange={(v) => toggleImport(c.id, !!v)} />
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate">{c.name}</span>
                            <span className="block text-xs text-muted-foreground truncate">{c.account}</span>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">Events from your phone come in as "Only me". To share one, open it on the calendar and pick who it's for under Share with. Birthdays aren't brought in.</p>
                  {status && <p className="text-xs text-muted-foreground">{status.imported} event{status.imported === 1 ? '' : 's'} from your phone. New ones come in on their own, even with GenCare closed.</p>}
                </div>
              )}
            </section>

            {/* Send to phone */}
            <section className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Put family events on my phone</h3>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Send to my phone calendar</p>
                  <p className="text-xs text-muted-foreground">Family events show up in your phone's calendar app.</p>
                </div>
                <Switch
                  checked={!!settings.export_enabled}
                  onCheckedChange={async (v) => {
                    if (v && !writeGranted) { await allowWrite(); const w = await listWritableCalendars(); if (!w.granted) return; setWriteGranted(true); setWritable(w.calendars); }
                    setExport({ export_enabled: !!v });
                  }}
                />
              </div>
              {settings.export_enabled && (
                <div className="space-y-3 pl-1">
                  <div>
                    <Label className="text-xs">Which phone calendar</Label>
                    <Select value={settings.export_calendar_id || ''} onValueChange={(v) => setExport({ export_calendar_id: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a calendar" /></SelectTrigger>
                      <SelectContent>
                        {writable.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.account}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!settings.export_calendar_id && <p className="text-xs text-muted-foreground mt-1">Tip: make a calendar called "Family" in your calendar app and pick it here, so GenCare's events stay in their own color.</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">Events shared with you (by the whole family or by name) go on this calendar; the person adding an event decides that with "Share with".</p>
                  <div>
                    <Label className="text-xs">Reminder on the phone</Label>
                    <Select value={String(settings.export_reminder_minutes ?? 30)} onValueChange={(v) => setExport({ export_reminder_minutes: Number(v) })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{REMINDERS.map((r) => <SelectItem key={r.v} value={String(r.v)}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {status && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {status.exported} on your phone{status.pending ? `, ${status.pending} waiting` : ''}{status.failed ? `, ${status.failed} failed` : ''}. Things the family adds land there on their own.
                    </p>
                  )}
                </div>
              )}
            </section>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={syncNow} disabled={!!busy} className="gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

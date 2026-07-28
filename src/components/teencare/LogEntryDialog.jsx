import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const subOptions = {
  transport: ['carpool', 'rideshare', 'pickup', 'dropoff'],
  financial: ['allowance', 'school_fee', 'bank_transfer'],
  document: ['physical', 'immunization', 'insurance', 'sports_clearance'],
  academic: ['college_app', 'fafsa', 'test'],
};

export default function LogEntryDialog({ open, onOpenChange, teens, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'transport',
    family_member_id: '',
    timestamp: nowLocal(),
    sub_type: '',
    title: '',
    date: '',
    time: '',
    amount: '',
    location: '',
    contact: '',
    status: 'pending',
    doc_url: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'transport',
        sub_type: subOptions[defaultType || 'transport'][0],
        family_member_id: defaultMemberId || f.family_member_id || teens[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, teens]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = {
      entry_type: form.entry_type,
      family_member_id: form.family_member_id,
      timestamp: new Date(form.timestamp).toISOString(),
      sub_type: form.sub_type || undefined,
      title: form.title || undefined,
      date: form.date || undefined,
      time: form.time || undefined,
      location: form.location || undefined,
      contact: form.contact || undefined,
      status: form.entry_type === 'academic' ? form.status : undefined,
      doc_url: form.doc_url || undefined,
      notes: form.notes || undefined,
    };
    if (form.entry_type === 'financial') payload.amount = Number(form.amount) || undefined;
    onCreate(payload);
  };

  const t = form.entry_type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl capitalize">Log {t}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Teen</Label>
            <Select value={form.family_member_id} onValueChange={v => set('family_member_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select teen" /></SelectTrigger>
              <SelectContent>
                {teens.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Type</Label>
            <Select value={form.sub_type} onValueChange={v => set('sub_type', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {subOptions[t].map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title / description</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Ride to soccer practice" className="mt-1" />
          </div>

          {t === 'transport' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => set('location', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Driver / contact</Label>
                <Input value={form.contact} onChange={e => set('contact', e.target.value)} className="mt-1" />
              </div>
            </>
          )}

          {t === 'financial' && (
            <>
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
            </>
          )}

          {t === 'document' && (
            <>
              <div>
                <Label>Date / expiration</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Document link (optional)</Label>
                <Input value={form.doc_url} onChange={e => set('doc_url', e.target.value)} placeholder="https://..." className="mt-1" />
              </div>
            </>
          )}

          {t === 'academic' && (
            <>
              <div>
                <Label>Deadline</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="mt-1" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.family_member_id || isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
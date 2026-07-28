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
  care_log: ['meal', 'vitals', 'medication_given'],
  legal: ['poa', 'living_will', 'dnr', 'medicaid', 'insurance'],
  medication: ['prescription', 'refill', 'contraindication'],
  cognitive: ['memory', 'language', 'mobility'],
};

export default function LogEntryDialog({ open, onOpenChange, seniors, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'care_log',
    family_member_id: '',
    timestamp: nowLocal(),
    sub_type: 'meal',
    title: '',
    date: '',
    time: '',
    given_by: '',
    vitals: '',
    pharmacy: '',
    doc_url: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'care_log',
        sub_type: subOptions[defaultType || 'care_log'][0],
        family_member_id: defaultMemberId || f.family_member_id || seniors[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, seniors]);

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
      given_by: form.entry_type === 'care_log' ? form.given_by || undefined : undefined,
      vitals: form.entry_type === 'care_log' ? form.vitals || undefined : undefined,
      pharmacy: form.entry_type === 'medication' ? form.pharmacy || undefined : undefined,
      doc_url: form.entry_type === 'legal' ? form.doc_url || undefined : undefined,
      notes: form.notes || undefined,
    };
    onCreate(payload);
  };

  const t = form.entry_type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl capitalize">Log {t.replace('_', ' ')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Family member</Label>
            <Select value={form.family_member_id} onValueChange={v => set('family_member_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {seniors.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
            <Label>{t === 'cognitive' ? 'Observation' : 'Title / description'}</Label>
            <Textarea value={form.title} onChange={e => set('title', e.target.value)} rows={2} className="mt-1" placeholder={t === 'cognitive' ? 'e.g. Forgot names twice this week' : 'e.g. Breakfast and morning meds'} />
          </div>

          {t === 'care_log' && (
            <>
              <div>
                <Label>Provided by</Label>
                <Input value={form.given_by} onChange={e => set('given_by', e.target.value)} placeholder="e.g. Aide Maria, Dad" className="mt-1" />
              </div>
              <div>
                <Label>Vitals (optional)</Label>
                <Input value={form.vitals} onChange={e => set('vitals', e.target.value)} placeholder="e.g. BP 120/80" className="mt-1" />
              </div>
            </>
          )}

          {t === 'legal' && (
            <div>
              <Label>Document link (optional)</Label>
              <Input value={form.doc_url} onChange={e => set('doc_url', e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
          )}

          {t === 'medication' && (
            <>
              <div>
                <Label>Pharmacy</Label>
                <Input value={form.pharmacy} onChange={e => set('pharmacy', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Refill date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
            </>
          )}

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className="mt-1" />
          </div>

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
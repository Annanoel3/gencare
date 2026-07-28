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

export default function LogEntryDialog({ open, onOpenChange, babies, defaultMemberId, defaultType, isPending, onCreate }) {
  const [form, setForm] = useState({
    entry_type: 'feeding',
    family_member_id: '',
    timestamp: nowLocal(),
    feeding_method: 'nursing',
    breast_side: 'left',
    amount_ml: '',
    duration_min: '',
    diaper_type: 'wet',
    sleep_type: 'nap',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        entry_type: defaultType || 'feeding',
        family_member_id: defaultMemberId || f.family_member_id || babies[0]?.id || '',
        timestamp: nowLocal(),
      }));
    }
  }, [open, defaultType, defaultMemberId, babies]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = {
      entry_type: form.entry_type,
      family_member_id: form.family_member_id,
      timestamp: new Date(form.timestamp).toISOString(),
      notes: form.notes || undefined,
    };
    if (form.entry_type === 'feeding') {
      payload.feeding_method = form.feeding_method;
      if (form.feeding_method === 'nursing') {
        payload.breast_side = form.breast_side;
        payload.duration_min = Number(form.duration_min) || undefined;
      } else {
        payload.amount_ml = Number(form.amount_ml) || undefined;
      }
    } else if (form.entry_type === 'diaper') {
      payload.diaper_type = form.diaper_type;
    } else if (form.entry_type === 'sleep') {
      payload.sleep_type = form.sleep_type;
      payload.duration_min = Number(form.duration_min) || undefined;
    } else if (form.entry_type === 'pumping') {
      payload.amount_ml = Number(form.amount_ml) || undefined;
      payload.breast_side = form.breast_side || undefined;
    }
    onCreate(payload);
  };

  const showFeeding = form.entry_type === 'feeding';
  const showNursing = showFeeding && form.feeding_method === 'nursing';
  const showBottleSolid = showFeeding && form.feeding_method !== 'nursing';
  const showDiaper = form.entry_type === 'diaper';
  const showSleep = form.entry_type === 'sleep';
  const showPump = form.entry_type === 'pumping';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl capitalize">Log {form.entry_type}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Baby</Label>
            <Select value={form.family_member_id} onValueChange={v => set('family_member_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select baby" /></SelectTrigger>
              <SelectContent>
                {babies.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>When</Label>
            <Input type="datetime-local" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className="mt-1" />
          </div>

          {showFeeding && (
            <div>
              <Label>Method</Label>
              <Select value={form.feeding_method} onValueChange={v => set('feeding_method', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nursing">Nursing</SelectItem>
                  <SelectItem value="bottle">Bottle</SelectItem>
                  <SelectItem value="solid">Solid food</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {showNursing && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Side</Label>
                <Select value={form.breast_side} onValueChange={v => set('breast_side', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" inputMode="numeric" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
          {showBottleSolid && (
            <div>
              <Label>Amount (ml)</Label>
              <Input type="number" inputMode="numeric" value={form.amount_ml} onChange={e => set('amount_ml', e.target.value)} className="mt-1" />
            </div>
          )}

          {showDiaper && (
            <div>
              <Label>Diaper type</Label>
              <Select value={form.diaper_type} onValueChange={v => set('diaper_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wet">Wet</SelectItem>
                  <SelectItem value="dirty">Dirty</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {showSleep && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.sleep_type} onValueChange={v => set('sleep_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nap">Nap</SelectItem>
                    <SelectItem value="night">Night sleep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" inputMode="numeric" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} className="mt-1" />
              </div>
            </div>
          )}

          {showPump && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount (ml)</Label>
                <Input type="number" inputMode="numeric" value={form.amount_ml} onChange={e => set('amount_ml', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Side</Label>
                <Select value={form.breast_side || ''} onValueChange={v => set('breast_side', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
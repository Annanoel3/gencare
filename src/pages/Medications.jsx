import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Pill, Plus, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';

const frequencies = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Weekly', 'Bi-weekly', 'Monthly', 'As needed'];

export default function Medications() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ medication_name: '', dosage: '', frequency: 'Once daily', family_member_id: '', instructions: '', prescribing_doctor: '', pharmacy: '', refill_date: '' });
  const queryClient = useQueryClient();

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: () => base44.entities.Medication.list('-created_date', 100),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const member = members.find(m => m.id === data.family_member_id);
      return base44.entities.Medication.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      setDialogOpen(false);
      setForm({ medication_name: '', dosage: '', frequency: 'Once daily', family_member_id: '', instructions: '', prescribing_doctor: '', pharmacy: '', refill_date: '' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Medication.update(id, { is_active: !is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medications'] }),
  });

  const active = medications.filter(m => m.is_active !== false);
  const inactive = medications.filter(m => m.is_active === false);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Pill className="w-7 h-7 text-primary" />
            Medications
          </h1>
          <p className="text-muted-foreground mt-1">Track and manage medications for your family.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Add Medication
        </Button>
      </div>

      {medications.length === 0 ? (
        <div className="text-center py-20">
          <Pill className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No medications tracked</h2>
          <p className="text-muted-foreground mb-6">Start tracking medications for your family members.</p>
          <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> Add Medication</Button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active ({active.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {active.map((med, i) => (
                  <MedCard key={med.id} med={med} i={i} onToggle={() => toggleMutation.mutate({ id: med.id, is_active: med.is_active })} />
                ))}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Inactive ({inactive.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inactive.map((med, i) => (
                  <MedCard key={med.id} med={med} i={i} onToggle={() => toggleMutation.mutate({ id: med.id, is_active: med.is_active })} inactive />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl">Add Medication</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Medication Name *</Label><Input value={form.medication_name} onChange={e => setForm({...form, medication_name: e.target.value})} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Dosage</Label><Input value={form.dosage} onChange={e => setForm({...form, dosage: e.target.value})} placeholder="e.g. 10mg" className="mt-1" /></div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm({...form, frequency: v})}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{frequencies.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Family Member</Label>
              <Select value={form.family_member_id} onValueChange={v => setForm({...form, family_member_id: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Instructions</Label><Input value={form.instructions} onChange={e => setForm({...form, instructions: e.target.value})} placeholder="e.g. Take with food" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Doctor</Label><Input value={form.prescribing_doctor} onChange={e => setForm({...form, prescribing_doctor: e.target.value})} className="mt-1" /></div>
              <div><Label>Pharmacy</Label><Input value={form.pharmacy} onChange={e => setForm({...form, pharmacy: e.target.value})} className="mt-1" /></div>
            </div>
            <div><Label>Next Refill Date</Label><Input type="date" value={form.refill_date} onChange={e => setForm({...form, refill_date: e.target.value})} className="mt-1" /></div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.medication_name || createMutation.isPending}>
                {createMutation.isPending ? 'Adding...' : 'Add Medication'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MedCard({ med, i, onToggle, inactive }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
      <Card className={`p-4 border-border/50 ${inactive ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{med.medication_name}</h3>
              {med.refill_date && new Date(med.refill_date) <= new Date(Date.now() + 7 * 86400000) && (
                <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="w-3 h-3" /> Refill soon</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{med.dosage} · {med.frequency}</p>
            {med.family_member_name && <p className="text-xs text-muted-foreground mt-1">For {med.family_member_name}</p>}
            {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">{med.instructions}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onToggle} className="rounded-full">
            {inactive ? <RefreshCw className="w-4 h-4" /> : <Check className="w-4 h-4 text-emerald-600" />}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
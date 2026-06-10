import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const categories = ['Medication', 'Meals', 'School', 'Personal Care', 'Pet Care', 'Elderly Care', 'Other'];

export default function CreateChecklistDialog({ open, onOpenChange, form, setForm, members, onSubmit, isPending }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">New Checklist</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Morning Medications, Feed the Dog..."
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resets</Label>
              <Select value={form.reset_frequency} onValueChange={v => setForm({ ...form, reset_frequency: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every Day</SelectItem>
                  <SelectItem value="weekly">Every Week</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>For Family Member (optional)</Label>
            <Select value={form.family_member_id} onValueChange={v => setForm({ ...form, family_member_id: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Whole family" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole family</SelectItem>
                {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={!form.title.trim() || isPending}>
              {isPending ? 'Creating...' : 'Create Checklist'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
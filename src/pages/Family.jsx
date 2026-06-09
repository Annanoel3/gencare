import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Users, Plus, Heart, Phone, School, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';

const memberColors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500',
];

const relationships = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Son', 'Daughter', 'Spouse', 'Sibling', 'Uncle', 'Aunt', 'Cousin', 'Foster Child', 'Other'];

export default function Family() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', relationship: '', birthdate: '', care_notes: '' });
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FamilyMember.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyMembers'] });
      setDialogOpen(false);
      setForm({ name: '', relationship: '', birthdate: '', care_notes: '' });
    },
  });

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            Family Members
          </h1>
          <p className="text-muted-foreground mt-1">Manage your loved ones' profiles and information.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Add Member
        </Button>
      </div>

      {members.length === 0 && !isLoading ? (
        <div className="text-center py-20">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No family members yet</h2>
          <p className="text-muted-foreground mb-6">Add your first family member to get started.</p>
          <Button onClick={() => setDialogOpen(true)} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Add Family Member
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/family/${member.id}`}
                className="block bg-card rounded-2xl border border-border/50 p-5 hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={member.photo_url} />
                    <AvatarFallback className={`${memberColors[i % memberColors.length]} text-white text-lg font-bold`}>
                      {member.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.relationship}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {member.primary_doctor && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Stethoscope className="w-4 h-4" />
                      <span className="truncate">Dr. {member.primary_doctor}</span>
                    </div>
                  )}
                  {member.emergency_contact_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span className="truncate">{member.emergency_contact_name}</span>
                    </div>
                  )}
                  {member.school_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <School className="w-4 h-4" />
                      <span className="truncate">{member.school_name}</span>
                    </div>
                  )}
                  {member.medical_conditions?.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Heart className="w-4 h-4" />
                      <span className="truncate">{member.medical_conditions.join(', ')}</span>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Add Family Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label>Relationship *</Label>
              <Select value={form.relationship} onValueChange={v => setForm({...form, relationship: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                <SelectContent>
                  {relationships.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.birthdate} onChange={e => setForm({...form, birthdate: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Care Notes</Label>
              <Textarea value={form.care_notes} onChange={e => setForm({...form, care_notes: e.target.value})} placeholder="Any important notes..." className="mt-1" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || !form.relationship || createMutation.isPending}
              >
                {createMutation.isPending ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
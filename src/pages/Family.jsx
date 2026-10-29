import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withFamily, useFamily, relationshipLabel, orderMembers } from '@/lib/family';
import { Link } from 'react-router-dom';
import { Users, Plus, School, QrCode, StickyNote, PawPrint, HeartHandshake } from 'lucide-react';
import InviteModal from '@/components/family/InviteModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';

import { getMemberColorClass, isPet } from '@/utils/memberColors';

const relationships = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Son', 'Daughter', 'Spouse', 'Sibling', 'Uncle', 'Aunt', 'Cousin', 'Foster Child', 'Other'];
const EMPTY = { name: '', relationship: '', birthdate: '', care_notes: '' };

export default function Family() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [petMode, setPetMode] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState(null);
  const [inviteAfterAdd, setInviteAfterAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  // One form for people and pets; a pet is a profile with relationship "Pet".
  const openAdd = (pet) => { setPetMode(pet); setForm({ ...EMPTY, relationship: pet ? 'Pet' : '' }); setDialogOpen(true); };
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const { me } = useFamily();
  // You, then the other people, then the pets (same order as Home).
  const shown = orderMembers(members, me?.id);
  const peopleShown = shown.filter((m) => !isPet(m));
  const petsShown = shown.filter(isPet);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FamilyMember.create(withFamily(data)),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['familyMembers'] });
      setDialogOpen(false);
      setForm(EMPTY);
      // "Add & invite": the invite is for the profile just made, so when they
      // join with it, this profile becomes theirs.
      if (inviteAfterAdd && created?.id) { setInviteFor(created); setInviteOpen(true); }
      setInviteAfterAdd(false);
    },
  });

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            Family Members
          </h1>
          <p className="text-muted-foreground mt-1">Manage your loved ones' profiles and information.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)} className="rounded-xl gap-2">
            <QrCode className="w-4 h-4" /> Invite
          </Button>
          <Button variant="outline" onClick={() => openAdd(true)} className="rounded-xl gap-2">
            <PawPrint className="w-4 h-4" /> Add Pet
          </Button>
          <Button onClick={() => openAdd(false)} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Add Member
          </Button>
        </div>
      </div>

      {members.length === 0 && !isLoading ? (
        <div className="text-center py-20">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No family members yet</h2>
          <p className="text-muted-foreground mb-6">Add your first family member to get started.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => openAdd(false)} className="rounded-xl gap-2">
              <Plus className="w-4 h-4" /> Add Family Member
            </Button>
            <Button variant="outline" onClick={() => openAdd(true)} className="rounded-xl gap-2">
              <PawPrint className="w-4 h-4" /> Add Pet
            </Button>
          </div>
        </div>
      ) : (
        <>
        {[{ key: 'people', title: '', list: peopleShown }, { key: 'pets', title: 'Pets', list: petsShown }].filter((g) => g.list.length).map((g) => (
        <section key={g.key} className="mb-6">
        {g.title && <h2 className="font-heading text-lg font-semibold mb-3 flex items-center gap-2"><PawPrint className="w-5 h-5 text-primary" /> {g.title}</h2>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {g.list.map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="bg-card rounded-2xl border border-border/50 hover:shadow-md transition-all">
              <Link to={`/family/${member.id}`} className="block p-5 pb-3">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={member.photo_url} />
                    <AvatarFallback className={`${getMemberColorClass(member, members)} text-white text-lg font-bold`}>
                      {member.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{[relationshipLabel(member, me?.id), member.linked_user_id && member.linked_user_id !== me?.id ? 'On GenCare' : ''].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {member.school_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <School className="w-4 h-4" />
                      <span className="truncate">{member.school_name}</span>
                    </div>
                  )}
                  {member.care_notes && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <StickyNote className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{member.care_notes.split('\n')[0]}</span>
                    </div>
                  )}
                </div>
              </Link>
              {/* Straight to their Care Log (Anna, Oct 29 2026). */}
              <div className="flex gap-2 px-5 pb-4">
                <Link to={`/care-log?for=${member.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-medium py-2">
                  <HeartHandshake className="w-4 h-4" /> Care log
                </Link>
                <Link to={`/family/${member.id}`} className="flex-1 inline-flex items-center justify-center rounded-xl border border-border text-sm font-medium py-2 text-foreground">
                  Profile
                </Link>
              </div>
              </div>
            </motion.div>
          ))}
        </div>
        </section>
        ))}
        </>
      )}

      <InviteModal open={inviteOpen} member={inviteFor} onClose={() => { setInviteOpen(false); setInviteFor(null); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{petMode ? 'Add Pet' : 'Add Family Member'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder={petMode ? "Pet's name" : 'Full name'} className="mt-1" />
            </div>
            {!petMode && <div>
              <Label>Relationship *</Label>
              <Select value={form.relationship} onValueChange={v => setForm({...form, relationship: v})}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                <SelectContent>
                  {relationships.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>}
            <div>
              <Label>{petMode ? 'Birthday' : 'Date of Birth'}</Label>
              <Input type="date" value={form.birthdate} onChange={e => setForm({...form, birthdate: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Important info</Label>
              <Textarea value={form.care_notes} onChange={e => setForm({...form, care_notes: e.target.value})} placeholder={petMode ? 'Food, medicine, vet, anything the family should know' : 'Anything the family should know about them'} className="mt-1" />
            </div>
            {!petMode && (
              <p className="text-xs text-muted-foreground">Will they use GenCare on their own phone? Tap Add &amp; Invite: when they join with the invite, this profile becomes theirs.</p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              {!petMode && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => { setInviteAfterAdd(true); createMutation.mutate(form); }}
                  disabled={!form.name || !form.relationship || createMutation.isPending}
                >
                  <QrCode className="w-4 h-4" /> Add &amp; Invite
                </Button>
              )}
              <Button
                onClick={() => { setInviteAfterAdd(false); createMutation.mutate(form); }}
                disabled={!form.name || !form.relationship || createMutation.isPending}
              >
                {createMutation.isPending ? 'Adding...' : petMode ? 'Add Pet' : 'Add Member'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
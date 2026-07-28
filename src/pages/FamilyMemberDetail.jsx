import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Heart, Pill, Phone, School, Stethoscope, FileText, Edit, Save, X, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CareFeed from '@/components/dashboard/CareFeed';

export default function FamilyMemberDetail() {
  const { id } = useParams();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const queryClient = useQueryClient();

  const { data: member, isLoading } = useQuery({
    queryKey: ['familyMember', id],
    queryFn: async () => {
      const members = await base44.entities.FamilyMember.filter({ id });
      return members[0];
    },
  });

  const { data: medications = [] } = useQuery({
    queryKey: ['memberMedications', id],
    queryFn: () => base44.entities.Medication.filter({ family_member_id: id }),
  });

  const { data: journal = [] } = useQuery({
    queryKey: ['memberJournal', id],
    queryFn: () => base44.entities.CareJournal.filter({ family_member_id: id }, '-created_date', 20),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.FamilyMember.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyMember', id] });
      setEditing(false);
    },
  });

  const startEditing = () => {
    setForm({
      medical_conditions: member?.medical_conditions?.join(', ') || '',
      allergies: member?.allergies?.join(', ') || '',
      primary_doctor: member?.primary_doctor || '',
      primary_doctor_phone: member?.primary_doctor_phone || '',
      insurance_provider: member?.insurance_provider || '',
      insurance_policy_number: member?.insurance_policy_number || '',
      preferred_pharmacy: member?.preferred_pharmacy || '',
      emergency_contact_name: member?.emergency_contact_name || '',
      emergency_contact_phone: member?.emergency_contact_phone || '',
      school_name: member?.school_name || '',
      school_grade: member?.school_grade || '',
      school_teacher: member?.school_teacher || '',
      care_notes: member?.care_notes || '',
    });
    setEditing(true);
  };

  const saveEditing = () => {
    const data = {
      ...form,
      medical_conditions: form.medical_conditions ? form.medical_conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
      allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    updateMutation.mutate(data);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (!member) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Family member not found.</p>
      <Link to="/family" className="text-primary hover:underline mt-2 inline-block">Back to Family</Link>
    </div>
  );

  return (
    <div className="pb-24 lg:pb-8">
      <Link to="/family" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Family
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <Avatar className="w-16 h-16">
          <AvatarImage src={member.photo_url} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
            {member.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">{member.name}</h1>
          <p className="text-muted-foreground">{member.relationship}{member.birthdate ? ` · Born ${member.birthdate}` : ''}</p>
        </div>
        {!editing ? (
          <Button variant="outline" onClick={startEditing} className="gap-2 rounded-xl">
            <Edit className="w-4 h-4" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} className="gap-2 rounded-xl"><X className="w-4 h-4" /> Cancel</Button>
            <Button onClick={saveEditing} disabled={updateMutation.isPending} className="gap-2 rounded-xl">
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="medical" className="space-y-4">
        <TabsList className="bg-muted rounded-xl w-full grid grid-cols-6">
          <TabsTrigger value="overview" className="rounded-lg text-xs px-1">Overview</TabsTrigger>
          <TabsTrigger value="medical" className="rounded-lg text-xs px-1">Medical</TabsTrigger>
          <TabsTrigger value="contacts" className="rounded-lg text-xs px-1">Contacts</TabsTrigger>
          <TabsTrigger value="school" className="rounded-lg text-xs px-1">School</TabsTrigger>
          <TabsTrigger value="medications" className="rounded-lg text-xs px-1">Meds</TabsTrigger>
          <TabsTrigger value="journal" className="rounded-lg text-xs px-1">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-primary" /> {member.name}'s Care Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <CareFeed members={members} memberId={id} scope="recent" limit={20} title="Recent Care Activity" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medical">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" /> Medical Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div><Label>Medical Conditions (comma separated)</Label><Input value={form.medical_conditions} onChange={e => setForm({...form, medical_conditions: e.target.value})} className="mt-1" /></div>
                  <div><Label>Allergies (comma separated)</Label><Input value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} className="mt-1" /></div>
                  <div><Label>Insurance Provider</Label><Input value={form.insurance_provider} onChange={e => setForm({...form, insurance_provider: e.target.value})} className="mt-1" /></div>
                  <div><Label>Policy Number</Label><Input value={form.insurance_policy_number} onChange={e => setForm({...form, insurance_policy_number: e.target.value})} className="mt-1" /></div>
                  <div><Label>Preferred Pharmacy</Label><Input value={form.preferred_pharmacy} onChange={e => setForm({...form, preferred_pharmacy: e.target.value})} className="mt-1" /></div>
                  <div><Label>Care Notes</Label><Textarea value={form.care_notes} onChange={e => setForm({...form, care_notes: e.target.value})} className="mt-1" /></div>
                </>
              ) : (
                <>
                  <InfoRow label="Conditions" value={member.medical_conditions?.length > 0 ? member.medical_conditions.map((c, i) => <Badge key={i} variant="secondary" className="mr-1">{c}</Badge>) : 'None listed'} />
                  <InfoRow label="Allergies" value={member.allergies?.length > 0 ? member.allergies.map((a, i) => <Badge key={i} variant="destructive" className="mr-1">{a}</Badge>) : 'None listed'} />
                  <InfoRow label="Insurance" value={member.insurance_provider ? `${member.insurance_provider} — ${member.insurance_policy_number || ''}` : 'Not set'} />
                  <InfoRow label="Pharmacy" value={member.preferred_pharmacy || 'Not set'} />
                  <InfoRow label="Care Notes" value={member.care_notes || 'No notes'} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="font-heading flex items-center gap-2"><Phone className="w-5 h-5 text-blue-500" /> Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div><Label>Primary Doctor</Label><Input value={form.primary_doctor} onChange={e => setForm({...form, primary_doctor: e.target.value})} className="mt-1" /></div>
                  <div><Label>Doctor Phone</Label><Input value={form.primary_doctor_phone} onChange={e => setForm({...form, primary_doctor_phone: e.target.value})} className="mt-1" /></div>
                  <div><Label>Emergency Contact</Label><Input value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})} className="mt-1" /></div>
                  <div><Label>Emergency Phone</Label><Input value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})} className="mt-1" /></div>
                </>
              ) : (
                <>
                  <InfoRow label="Primary Doctor" value={member.primary_doctor ? `Dr. ${member.primary_doctor}` : 'Not set'} />
                  <InfoRow label="Doctor Phone" value={member.primary_doctor_phone || 'Not set'} />
                  <InfoRow label="Emergency Contact" value={member.emergency_contact_name || 'Not set'} />
                  <InfoRow label="Emergency Phone" value={member.emergency_contact_phone || 'Not set'} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="school">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="font-heading flex items-center gap-2"><School className="w-5 h-5 text-purple-500" /> School Info</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div><Label>School Name</Label><Input value={form.school_name} onChange={e => setForm({...form, school_name: e.target.value})} className="mt-1" /></div>
                  <div><Label>Grade</Label><Input value={form.school_grade} onChange={e => setForm({...form, school_grade: e.target.value})} className="mt-1" /></div>
                  <div><Label>Teacher</Label><Input value={form.school_teacher} onChange={e => setForm({...form, school_teacher: e.target.value})} className="mt-1" /></div>
                </>
              ) : (
                <>
                  <InfoRow label="School" value={member.school_name || 'Not set'} />
                  <InfoRow label="Grade" value={member.school_grade || 'Not set'} />
                  <InfoRow label="Teacher" value={member.school_teacher || 'Not set'} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medications">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading flex items-center gap-2"><Pill className="w-5 h-5 text-emerald-500" /> Medications</CardTitle>
                <Link to="/medications" className="text-sm text-primary hover:underline">Manage all</Link>
              </div>
            </CardHeader>
            <CardContent>
              {medications.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No medications tracked for {member.name}.</p>
              ) : (
                <div className="space-y-3">
                  {medications.map(med => (
                    <div key={med.id} className="p-3 rounded-xl bg-muted/50">
                      <p className="font-medium">{med.medication_name}</p>
                      <p className="text-sm text-muted-foreground">{med.dosage} · {med.frequency}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading flex items-center gap-2"><FileText className="w-5 h-5 text-amber-500" /> Care Journal</CardTitle>
                <Link to="/journal" className="text-sm text-primary hover:underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent>
              {journal.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No journal entries for {member.name}.</p>
              ) : (
                <div className="space-y-3">
                  {journal.map(entry => (
                    <div key={entry.id} className="p-3 rounded-xl bg-muted/50">
                      <p className="text-sm">{entry.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{entry.category} · {new Date(entry.created_date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/30 last:border-0">
      <span className="text-sm font-medium text-muted-foreground w-40 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
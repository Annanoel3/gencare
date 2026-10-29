import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, BellRing, Phone, School, FileText, Edit, Save, X, LayoutDashboard, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CareFeed from '@/components/dashboard/CareFeed';
import PhoneActions from '@/components/shared/PhoneActions';
import MemberColorPicker from '@/components/family/MemberColorPicker';
import { getMemberColorClass, isPet, takenColors } from '@/utils/memberColors';
import { frequencyLabel, fmtClock } from '@/lib/reminders';
import InviteModal from '@/components/family/InviteModal';
import { useFamily, relationshipLabel } from '@/lib/family';

const TAB_LABELS = { overview: 'Overview', info: 'Info', contacts: 'Contacts', school: 'School', reminders: 'Reminders', journal: 'Journal' };

export default function FamilyMemberDetail() {
  const { id } = useParams();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const { me } = useFamily();
  const queryClient = useQueryClient();

  const { data: member, isLoading } = useQuery({
    queryKey: ['familyMember', id],
    queryFn: async () => {
      const members = await base44.entities.FamilyMember.filter({ id });
      return members[0];
    },
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ['memberReminders', id],
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
      other_contact_name: member?.other_contact_name || '',
      other_contact_phone: member?.other_contact_phone || '',
      emergency_contact_name: member?.emergency_contact_name || '',
      emergency_contact_phone: member?.emergency_contact_phone || '',
      school_name: member?.school_name || '',
      school_grade: member?.school_grade || '',
      school_teacher: member?.school_teacher || '',
      school_phone: member?.school_phone || '',
      care_notes: member?.care_notes || '',
    });
    setEditing(true);
  };

  const saveEditing = () => updateMutation.mutate({ ...form });

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
  const pet = isPet(member);
  // School only for someone of school age (under 23), or, with no birthday, a
  // child of the family; and always if school info was already filled in.
  const years = member.birthdate ? (Date.now() - Date.parse(member.birthdate)) / (365.25 * 86400e3) : null;
  const showSchool = !pet && (!!(member.school_name || member.school_phone || member.school_grade || member.school_teacher)
    || (years !== null && !Number.isNaN(years) ? years < 23 : /^(son|daughter|foster child|grandchild)$/i.test(String(member.relationship || ''))));
  const tabs = ['overview', 'info', 'contacts', showSchool && 'school', 'reminders', 'journal'].filter(Boolean);

  return (
    <div className="pb-24 lg:pb-8">
      <Link to="/family" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Family
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <Avatar className="w-16 h-16">
          <AvatarImage src={member.photo_url} />
          <AvatarFallback className={`${getMemberColorClass(member, members)} text-white text-xl font-bold`}>
            {member.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold">{member.name}</h1>
          <p className="text-muted-foreground">{[relationshipLabel(member, me?.id), member.birthdate && isValid(parseISO(member.birthdate)) ? `Born ${format(parseISO(member.birthdate), 'MMM d, yyyy')}` : ''].filter(Boolean).join(' · ')}</p>
          {pet ? null : member.linked_user_id ? (
            <p className="text-xs text-primary font-medium mt-1">{member.linked_user_id === me?.id ? 'This is you' : 'Uses GenCare'}</p>
          ) : (
            <button type="button" onClick={() => setInviteOpen(true)} className="text-xs text-primary font-medium mt-1 hover:underline">Invite {member.name.split(' ')[0]} to GenCare</button>
          )}
          {/* Every pet shares the pet color. */}
          {!pet && <MemberColorPicker
            value={getMemberColorClass(member, members)}
            taken={takenColors(members, member.id)}
            onChange={async (color) => {
              await base44.entities.FamilyMember.update(id, { color });
              queryClient.invalidateQueries({ queryKey: ['familyMember', id] });
              queryClient.invalidateQueries({ queryKey: ['familyMembers'] });
            }}
          />}
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

      <InviteModal open={inviteOpen} member={member} onClose={() => { setInviteOpen(false); queryClient.invalidateQueries({ queryKey: ['familyMember', id] }); }} />

      <Tabs defaultValue="overview" className="space-y-4">
        {/* Two rows of three on a phone, so every tab gets room and its whole
            word sits inside the highlight. */}
        <TabsList className="bg-muted rounded-xl w-full h-auto grid grid-cols-3 sm:grid-cols-6 gap-1 p-1">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="rounded-lg text-sm py-1.5 px-2 w-full">{TAB_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-primary" /> {member.name}'s Care Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-3"><Link to={`/care-log?for=${id}`} className="text-sm text-primary hover:underline">Open {member.name.split(' ')[0]}'s care log →</Link></div>
              <CareFeed members={members} memberId={id} scope="recent" limit={20} title="Recent Care Activity" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2"><StickyNote className="w-5 h-5 text-amber-500" /> Important info</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea value={form.care_notes} onChange={e => setForm({...form, care_notes: e.target.value})} rows={8} placeholder="Anything the family should know about them: what to pack, what to avoid, how they like things done, where the spare key is…" />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{member.care_notes || <span className="text-muted-foreground">Nothing yet. Tap Edit to add anything the family should know.</span>}</p>
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
                  <div><Label>Emergency Contact</Label><Input value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})} className="mt-1" /></div>
                  <div><Label>Emergency Phone</Label><Input value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})} className="mt-1" /></div>
                  <div><Label>Another Contact</Label><Input value={form.other_contact_name} onChange={e => setForm({...form, other_contact_name: e.target.value})} placeholder="e.g. neighbor, coach, babysitter" className="mt-1" /></div>
                  <div><Label>Their Phone</Label><Input value={form.other_contact_phone} onChange={e => setForm({...form, other_contact_phone: e.target.value})} className="mt-1" /></div>
                </>
              ) : (
                <>
                  <InfoRow label="Emergency Contact" value={member.emergency_contact_name || 'Not set'} />
                  <InfoRow label="Emergency Phone" value={member.emergency_contact_phone || 'Not set'} action={<PhoneActions number={member.emergency_contact_phone} name={member.emergency_contact_name} />} />
                  <InfoRow label="Another Contact" value={member.other_contact_name || 'Not set'} />
                  <InfoRow label="Their Phone" value={member.other_contact_phone || 'Not set'} action={<PhoneActions number={member.other_contact_phone} name={member.other_contact_name} />} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {showSchool && <TabsContent value="school">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="font-heading flex items-center gap-2"><School className="w-5 h-5 text-purple-500" /> School Info</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div><Label>School Name</Label><Input value={form.school_name} onChange={e => setForm({...form, school_name: e.target.value})} className="mt-1" /></div>
                  <div><Label>School Phone</Label><Input value={form.school_phone || ''} onChange={e => setForm({...form, school_phone: e.target.value})} className="mt-1" /></div>
                  <div><Label>Grade</Label><Input value={form.school_grade} onChange={e => setForm({...form, school_grade: e.target.value})} className="mt-1" /></div>
                  <div><Label>Teacher</Label><Input value={form.school_teacher} onChange={e => setForm({...form, school_teacher: e.target.value})} className="mt-1" /></div>
                </>
              ) : (
                <>
                  <InfoRow label="School" value={member.school_name || 'Not set'} />
                  <InfoRow label="School Phone" value={member.school_phone || 'Not set'} action={<PhoneActions number={member.school_phone} name={member.school_name} />} />
                  <InfoRow label="Grade" value={member.school_grade || 'Not set'} />
                  <InfoRow label="Teacher" value={member.school_teacher || 'Not set'} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>}

        <TabsContent value="reminders">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading flex items-center gap-2"><BellRing className="w-5 h-5 text-emerald-500" /> Reminders</CardTitle>
                <Link to="/reminders" className="text-sm text-primary hover:underline">See all</Link>
              </div>
            </CardHeader>
            <CardContent>
              {reminders.filter(r => r.is_active !== false).length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No reminders for {member.name}.</p>
              ) : (
                <div className="space-y-3">
                  {reminders.filter(r => r.is_active !== false).map(r => (
                    <Link key={r.id} to={`/reminders?item=${r.id}`} className="block p-3 rounded-xl bg-muted/50 hover:bg-muted">
                      <p className="font-medium">{r.medication_name}</p>
                      <p className="text-sm text-muted-foreground">{[r.dosage, frequencyLabel(r.frequency), Array.isArray(r.times) && r.times.length ? r.times.map(fmtClock).join(', ') : ''].filter(Boolean).join(' · ')}</p>
                    </Link>
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
                <div className="flex items-center gap-3">
                  <Link to={`/journal?for=${id}&new=1`} className="text-sm text-primary hover:underline">Add entry</Link>
                  <Link to={`/journal?for=${id}`} className="text-sm text-primary hover:underline">View all</Link>
                </div>
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
                      <p className="text-xs text-muted-foreground mt-1">{entry.category} · {new Date((entry.entry_date ? entry.entry_date + 'T12:00:00' : entry.created_date)).toLocaleDateString()}{entry.author_name ? ` · ${entry.author_name.split(' ')[0]}` : ''}</p>
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

function InfoRow({ label, value, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/30 last:border-0">
      <span className="text-sm font-medium text-muted-foreground w-40 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground flex-1">{value}</span>
      {action}
    </div>
  );
}
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { parseISO, format, isAfter, startOfDay } from 'date-fns';
import { HeartHandshake, ClipboardList, ShieldCheck, Pill, Brain, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSenior, formatAge } from '@/utils/age';
import { getMemberColorClass } from '@/utils/memberColors';
import LogEntryDialog from '@/components/seniorcare/LogEntryDialog';
import EntryItem from '@/components/seniorcare/EntryItem';
import CategorySummary from '@/components/seniorcare/CategorySummary';

export default function SeniorCare() {
  const queryClient = useQueryClient();
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState('care_log');

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const seniors = useMemo(() => members.filter(isSenior), [members]);
  const effectiveMemberId = selectedMemberId || seniors[0]?.id || null;
  const selectedMember = seniors.find(p => p.id === effectiveMemberId);

  const { data: logs = [] } = useQuery({
    queryKey: ['seniorLogs'],
    queryFn: () => base44.entities.SeniorLog.list('-timestamp', 500),
  });

  const memberLogs = useMemo(
    () => logs.filter(l => l.family_member_id === effectiveMemberId)
      .sort((a, b) => parseISO(b.timestamp) - parseISO(a.timestamp)),
    [logs, effectiveMemberId]
  );
  const upcoming = useMemo(
    () => memberLogs
      .filter(l => l.date && isAfter(parseISO(l.date), startOfDay(new Date())))
      .sort((a, b) => parseISO(a.date) - parseISO(b.date)),
    [memberLogs]
  );

  const createMutation = useMutation({
    mutationFn: (data) => {
      const member = seniors.find(p => p.id === data.family_member_id);
      return base44.entities.SeniorLog.create({ ...data, family_member_name: member?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seniorLogs'] });
      setDialogOpen(false);
    },
  });

  const openLog = (type) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const quickActions = [
    { type: 'care_log', label: 'Care Log', icon: ClipboardList, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { type: 'legal', label: 'Legal Docs', icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { type: 'medication', label: 'Medication', icon: Pill, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { type: 'cognitive', label: 'Cognitive', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  ];

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <HeartHandshake className="w-7 h-7 text-primary" />
            Senior Care
          </h1>
          <p className="text-muted-foreground mt-1">Caregiver dashboard — care coordination, legal vault, medications, and cognitive monitoring for aging family.</p>
        </div>
      </div>

      {seniors.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <HeartHandshake className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold mb-2">No senior family members yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Senior Care features appear automatically for family members 65 and older. Add them with a birthdate to get started.
          </p>
          <Button asChild className="rounded-xl gap-2">
            <Link to="/family"><Plus className="w-4 h-4" /> Add Family Member</Link>
          </Button>
        </div>
      ) : (
        <>
          {seniors.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {seniors.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedMemberId(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    p.id === effectiveMemberId
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(p, members)}`} />
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {selectedMember && (
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(selectedMember, members)}`}>
                {selectedMember.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-heading text-lg font-semibold">{selectedMember.name}</p>
                <p className="text-sm text-muted-foreground">{formatAge(selectedMember.birthdate)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {quickActions.map(a => (
              <button
                key={a.type}
                onClick={() => openLog(a.type)}
                className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-center gap-2 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.bg}`}>
                  <a.icon className={`w-5 h-5 ${a.color}`} />
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </button>
            ))}
          </div>

          <h2 className="font-heading text-lg font-semibold mb-3">Summary</h2>
          <div className="mb-6">
            <CategorySummary logs={memberLogs} />
          </div>

          {upcoming.length > 0 && (
            <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
              <h3 className="font-heading text-lg font-semibold mb-4">Upcoming Refills & Dates</h3>
              <div className="space-y-2">
                {upcoming.slice(0, 8).map(l => (
                  <div key={l.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{format(parseISO(l.date), 'MMM d')}</span>
                    <div className="flex-1 min-w-0"><EntryItem entry={l} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">Recent Activity</h3>
            {memberLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No entries yet. Tap a quick action above to start tracking.</p>
            ) : (
              <div className="space-y-2">
                {memberLogs.slice(0, 20).map(l => <EntryItem key={l.id} entry={l} />)}
              </div>
            )}
          </div>
        </>
      )}

      <LogEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        seniors={seniors}
        defaultMemberId={effectiveMemberId}
        defaultType={defaultType}
        isPending={createMutation.isPending}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { parseISO, format, isAfter, startOfDay } from 'date-fns';
import { Car, Wallet, FileText, GraduationCap, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isTeen, formatAge } from '@/utils/age';
import { getMemberColorClass } from '@/utils/memberColors';
import LogEntryDialog from '@/components/teencare/LogEntryDialog';
import EntryItem from '@/components/teencare/EntryItem';
import CategorySummary from '@/components/teencare/CategorySummary';

export default function TeenManagement() {
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState('transport');

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const teens = useMemo(() => members.filter(isTeen), [members]);
  const effectiveChildId = selectedChildId || teens[0]?.id || null;
  const selectedChild = teens.find(p => p.id === effectiveChildId);

  const { data: logs = [] } = useQuery({
    queryKey: ['teenLogs'],
    queryFn: () => base44.entities.TeenLog.list('-timestamp', 500),
  });

  const childLogs = useMemo(
    () => logs.filter(l => l.family_member_id === effectiveChildId)
      .sort((a, b) => parseISO(b.timestamp) - parseISO(a.timestamp)),
    [logs, effectiveChildId]
  );
  const upcoming = useMemo(
    () => childLogs
      .filter(l => l.date && isAfter(parseISO(l.date), startOfDay(new Date())))
      .sort((a, b) => parseISO(a.date) - parseISO(b.date)),
    [childLogs]
  );

  const createMutation = useMutation({
    mutationFn: (data) => {
      const child = teens.find(p => p.id === data.family_member_id);
      return base44.entities.TeenLog.create({ ...data, family_member_name: child?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teenLogs'] });
      setDialogOpen(false);
    },
  });

  const openLog = (type) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const quickActions = [
    { type: 'transport', label: 'Transport', icon: Car, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { type: 'financial', label: 'Financial', icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { type: 'document', label: 'Documents', icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { type: 'academic', label: 'Academic', icon: GraduationCap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  ];

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Car className="w-7 h-7 text-primary" />
            Teen Management
          </h1>
          <p className="text-muted-foreground mt-1">Caregiver dashboard — logistics, finances, documents, and deadlines for ages 13–18.</p>
        </div>
      </div>

      {teens.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <Car className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold mb-2">No teens in your family yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Teen Management features appear automatically for family members ages 13 to 18. Add them with a birthdate to get started.
          </p>
          <Button asChild className="rounded-xl gap-2">
            <Link to="/family"><Plus className="w-4 h-4" /> Add Family Member</Link>
          </Button>
        </div>
      ) : (
        <>
          {teens.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {teens.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedChildId(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    p.id === effectiveChildId
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

          {selectedChild && (
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(selectedChild, members)}`}>
                {selectedChild.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-heading text-lg font-semibold">{selectedChild.name}</p>
                <p className="text-sm text-muted-foreground">{formatAge(selectedChild.birthdate)}</p>
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
            <CategorySummary logs={childLogs} />
          </div>

          {upcoming.length > 0 && (
            <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
              <h3 className="font-heading text-lg font-semibold mb-4">Upcoming</h3>
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
            {childLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No entries yet. Tap a quick action above to start tracking.</p>
            ) : (
              <div className="space-y-2">
                {childLogs.slice(0, 20).map(l => <EntryItem key={l.id} entry={l} />)}
              </div>
            )}
          </div>
        </>
      )}

      <LogEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teens={teens}
        defaultMemberId={effectiveChildId}
        defaultType={defaultType}
        isPending={createMutation.isPending}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}
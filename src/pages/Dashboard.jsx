import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isToday, parseISO } from 'date-fns';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import StatCards from '@/components/dashboard/StatCards';
import TodayTimeline from '@/components/dashboard/TodayTimeline';
import FamilyOverview from '@/components/dashboard/FamilyOverview';
import RecentActivity from '@/components/dashboard/RecentActivity';

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 50),
  });

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: () => base44.entities.Medication.list('-created_date', 50),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['careTasks'],
    queryFn: () => base44.entities.CareTask.list('-created_date', 50),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['familyMessages'],
    queryFn: () => base44.entities.FamilyMessage.list('-created_date', 10),
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['careJournal'],
    queryFn: () => base44.entities.CareJournal.list('-created_date', 10),
  });

  const todayAppts = appointments.filter(a => a.date && isToday(parseISO(a.date)));
  const activeMeds = medications.filter(m => m.is_active !== false);
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed');

  return (
    <div className="pb-24 lg:pb-8">
      <WelcomeHeader userName={user?.full_name?.split(' ')[0]} />
      <StatCards
        appointments={todayAppts.length}
        medications={activeMeds.length}
        tasks={pendingTasks.length}
        urgentTasks={urgentTasks.length}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodayTimeline appointments={appointments} tasks={tasks} medications={medications} />
        <FamilyOverview members={members} />
        <RecentActivity messages={messages} journalEntries={journalEntries} />
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MESSAGES_KEY, listMessages } from '@/lib/messages';
import { expandAppointments } from '@/lib/occurrences';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import StatCards from '@/components/dashboard/StatCards';
import FamilyOverview from '@/components/dashboard/FamilyOverview';
import RecentActivity from '@/components/dashboard/RecentActivity';
import CareFeed from '@/components/dashboard/CareFeed';
import TodoCard from '@/components/dashboard/TodoCard';

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
    queryFn: () => base44.entities.CareTask.list('-created_date', 200),
  });

  const { data: allMessages = [] } = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages });
  const messages = allMessages.filter((m) => !m.parent_id).slice(0, 10);

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['careJournal'],
    queryFn: () => base44.entities.CareJournal.list('-created_date', 10),
  });

  const todayAppts = expandAppointments(appointments, new Date(), new Date());
  const activeMeds = medications.filter(m => m.is_active !== false);
  const topLevel = tasks.filter(t => !t.parent_task_id && t.kind !== 'checklist');
  const pendingTasks = topLevel.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const urgentTasks = topLevel.filter(t => t.priority === 'urgent' && t.status !== 'completed');

  return (
    <div className="pb-24 lg:pb-8">
      <WelcomeHeader userName={user?.full_name?.split(' ')[0]} />
      <StatCards
        appointments={todayAppts.length}
        medications={activeMeds.length}
        tasks={pendingTasks.length}
        urgentTasks={urgentTasks.length}
      />

      <TodoCard tasks={tasks} members={members} />

      <div className="mb-6">
        <h2 className="font-heading text-lg font-semibold mb-3">Today Across the Family</h2>
        <CareFeed members={members} scope="today" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FamilyOverview members={members} />
        <RecentActivity messages={messages} journalEntries={journalEntries} />
      </div>
    </div>
  );
}
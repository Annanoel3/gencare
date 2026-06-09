import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Pill, ClipboardList, Clock } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';

export default function TodayTimeline({ appointments, tasks, medications }) {
  const todayAppointments = appointments.filter(a => a.date && isToday(parseISO(a.date)));
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').slice(0, 5);
  const activeMeds = medications.filter(m => m.is_active !== false).slice(0, 5);

  const timelineItems = [
    ...todayAppointments.map(a => ({
      type: 'appointment',
      title: a.title,
      subtitle: a.family_member_name ? `For ${a.family_member_name}` : '',
      time: a.time || 'All day',
      icon: CalendarDays,
      color: 'text-blue-600 bg-blue-500/15',
    })),
    ...pendingTasks.map(t => ({
      type: 'task',
      title: t.title,
      subtitle: t.assigned_to ? `Assigned to ${t.assigned_to}` : '',
      time: t.due_time || (t.due_date ? format(parseISO(t.due_date), 'MMM d') : ''),
      icon: ClipboardList,
      color: t.priority === 'urgent' ? 'text-red-600 bg-red-500/15' : 'text-purple-600 bg-purple-500/15',
    })),
  ];

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Today's Timeline
          </CardTitle>
          <Link to="/calendar" className="text-sm text-primary hover:underline font-medium">View all</Link>
        </div>
      </CardHeader>
      <CardContent>
        {timelineItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nothing scheduled for today.</p>
            <p className="text-xs mt-1">Use the + button to add something.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timelineItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                </div>
                {item.time && (
                  <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{item.time}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
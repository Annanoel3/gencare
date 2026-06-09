import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, MessageCircle, BookOpen, ClipboardList } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';

export default function RecentActivity({ messages, journalEntries }) {
  const activities = [
    ...messages.map(m => ({
      type: 'message',
      content: m.content,
      author: m.author_name,
      date: m.created_date,
      icon: MessageCircle,
      color: 'text-blue-600 bg-blue-500/15',
      link: '/messages',
    })),
    ...journalEntries.map(j => ({
      type: 'journal',
      content: j.content,
      author: j.family_member_name || 'Care entry',
      date: j.created_date,
      icon: BookOpen,
      color: 'text-emerald-600 bg-emerald-500/15',
      link: '/journal',
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recent activity yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, i) => (
              <Link key={i} to={activity.link} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${activity.color}`}>
                  <activity.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">{activity.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.author} · {activity.date ? formatDistanceToNow(parseISO(activity.date), { addSuffix: true }) : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
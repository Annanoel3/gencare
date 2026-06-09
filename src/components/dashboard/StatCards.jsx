import React from 'react';
import { CalendarDays, Pill, ClipboardList, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StatCards({ appointments, medications, tasks, urgentTasks }) {
  const stats = [
    { label: "Today's Appointments", value: appointments, icon: CalendarDays, gradient: 'from-blue-500/10 to-blue-600/5', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-600' },
    { label: 'Active Medications', value: medications, icon: Pill, gradient: 'from-emerald-500/10 to-emerald-600/5', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600' },
    { label: 'Pending Tasks', value: tasks, icon: ClipboardList, gradient: 'from-purple-500/10 to-purple-600/5', iconBg: 'bg-purple-500/15', iconColor: 'text-purple-600' },
    { label: 'Urgent Items', value: urgentTasks, icon: AlertTriangle, gradient: 'from-red-500/10 to-red-600/5', iconBg: 'bg-red-500/15', iconColor: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`rounded-2xl bg-gradient-to-br ${stat.gradient} border border-border/50 p-4 md:p-5`}
        >
          <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center mb-3`}>
            <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  );
}
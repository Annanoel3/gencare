import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, BellRing } from 'lucide-react';
import { motion } from 'framer-motion';

// Today's events and reminders; tap one to go there. (Pending Tasks and
// Urgent Items went with tasks, Oct 29 2026.)
export default function StatCards({ appointments, reminders }) {
  const stats = [
    { label: 'Events Today', value: appointments, to: '/calendar', icon: CalendarDays, gradient: 'from-blue-500/10 to-blue-600/5', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-600' },
    { label: 'Reminders Today', value: reminders, to: '/tasks', icon: BellRing, gradient: 'from-emerald-500/10 to-emerald-600/5', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`rounded-2xl bg-gradient-to-br ${stat.gradient} border border-border/50`}
        >
          <Link to={stat.to} className="block p-4 md:p-5">
          <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center mb-3`}>
            <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
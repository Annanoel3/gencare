import React, { useState } from 'react';
import { Plus, X, Calendar, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// The floating + on every page. Each choice opens the same short form the
// page itself uses (one form per kind, so there's one simple way to add each).
const captureOptions = [
  { icon: Calendar, label: 'Event', to: '/calendar?new=1', color: 'bg-purple-500' },
  { icon: BellRing, label: 'Reminder', to: '/tasks?reminder=new', color: 'bg-emerald-500' },
];

export default function QuickCaptureButton() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="app-fab fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-3">
      <AnimatePresence>
        {expanded && captureOptions.map((opt, i) => (
          <motion.button
            key={opt.label}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => { setExpanded(false); navigate(opt.to); }}
            className="flex items-center gap-3 bg-card shadow-lg rounded-full pl-4 pr-2 py-2 border border-border hover:shadow-xl transition-shadow"
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap">{opt.label}</span>
            <div className={`w-10 h-10 rounded-full ${opt.color} flex items-center justify-center`}>
              <opt.icon className="w-5 h-5 text-white" />
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? 'Close' : 'Add'}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${expanded ? 'bg-foreground rotate-45' : 'bg-primary'}`}
      >
        {expanded ? <X className="w-6 h-6 text-background" /> : <Plus className="w-6 h-6 text-primary-foreground" />}
      </motion.button>
    </div>
  );
}

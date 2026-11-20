import React, { useEffect, useState } from 'react';
import { Plus, X, Calendar, BellRing, Camera, Megaphone, HeartHandshake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// The floating + on every page. Each choice opens the same short form the
// page itself uses (one form per kind, so there's one simple way to add each).
// what: what it's for, said on the tour's "Adding something" (Nov 20 2026).
export const ADD_CHOICES = [
  { icon: Calendar, label: 'Event', to: '/calendar?new=1', color: 'bg-purple-500', what: 'something on the calendar, like a haircut at 2 PM.' },
  { icon: Camera, label: 'Events from a photo', to: '/calendar?photo=1', color: 'bg-sky-500', what: 'take a picture of a schedule or a flyer, and GenCare puts its dates on the calendar.' },
  { icon: BellRing, label: 'Reminder', to: '/tasks?reminder=new', color: 'bg-emerald-500', what: 'something to do, like "Call the pharmacy." GenCare reminds the family until someone marks it done.' },
  // To the whole family, on their Home and as a notification (Anna, Nov 10 2026).
  { icon: Megaphone, label: 'Announcement', to: '/?announce=1', color: 'bg-purple-500', what: 'news for the whole family. It shows on everyone\'s Home and sends them a notification.' },
  // A feed, a diaper, Mom's lunch, the dog fed (Nov 10 2026).
  { icon: HeartHandshake, label: 'Log care', to: '/care-log', color: 'bg-rose-500', what: 'write down care as it happens, like a meal or feeding the dog, so the family knows it\'s done.' },
];

// The tour's "Adding something" (Anna, Nov 20 2026: "Make the green add button
// show up on top of the onboarding overlay. Make it clickable so the user can
// click on it and see what's there"): while it's on, the + sits above the
// tour, and tapping a choice tells the tour which one instead of opening it.
export const ADD_TOUR_EVENT = 'gencare-add-tour';
export const ADD_PICK_EVENT = 'gencare-add-pick';
const tell = (detail) => { try { window.dispatchEvent(new CustomEvent(ADD_PICK_EVENT, { detail })); } catch { /* fine */ } };

export default function QuickCaptureButton() {
  const [expanded, setExpanded] = useState(false);
  const [tour, setTour] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const on = (e) => { setTour(!!e.detail?.on); setExpanded(false); };
    window.addEventListener(ADD_TOUR_EVENT, on);
    return () => window.removeEventListener(ADD_TOUR_EVENT, on);
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (tour) tell({ open: next });
  };
  const choose = (opt) => {
    // On the tour the menu closes again, so the tour's card (which says what it's for) isn't hidden behind it.
    if (tour) { setExpanded(false); tell({ open: false, label: opt.label }); return; }
    setExpanded(false);
    navigate(opt.to);
  };

  return (
    <div className={`app-fab fixed bottom-20 right-4 flex flex-col-reverse items-end ${tour ? 'z-[60] gap-2' : 'z-50 gap-3'}`}>
      <AnimatePresence>
        {expanded && ADD_CHOICES.map((opt, i) => (
          <motion.button
            key={opt.label}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => choose(opt)}
            className={`flex items-center gap-3 bg-card shadow-lg rounded-full pl-4 pr-2 border border-border hover:shadow-xl transition-shadow ${tour ? 'py-1.5' : 'py-2'}`}
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap">{opt.label}</span>
            <div className={`${tour ? 'w-9 h-9' : 'w-10 h-10'} rounded-full ${opt.color} flex items-center justify-center`}>
              <opt.icon className="w-5 h-5 text-white" />
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
      <span className="relative">
        {tour && !expanded && <span className="absolute inset-0 rounded-full bg-primary/60 animate-ping" aria-hidden="true" />}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={toggle}
          aria-label={expanded ? 'Close' : 'Add'}
          className={`relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${expanded ? 'bg-foreground rotate-45' : 'bg-primary'} ${tour ? 'ring-4 ring-white/80' : ''}`}
        >
          {expanded ? <X className="w-6 h-6 text-background" /> : <Plus className="w-6 h-6 text-primary-foreground" />}
        </motion.button>
      </span>
    </div>
  );
}

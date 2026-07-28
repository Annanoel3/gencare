import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Pill, CalendarDays, 
  ClipboardList, BookOpen, MessageCircle, Menu, X,
  Heart, LogOut, Settings as SettingsIcon, ChevronDown, Wrench, Baby, Footprints, Backpack
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import QuickCaptureButton from '@/components/shared/QuickCaptureButton';
import OneSignalInit from '@/components/shared/OneSignalInit';

const navStructure = [
  { type: 'link', path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { type: 'group', label: 'Family', icon: Users, children: [
    { path: '/family', icon: Users, label: 'Family Members' },
    { path: '/messages', icon: MessageCircle, label: 'Messages' },
    { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
    { path: '/medications', icon: Pill, label: 'Medications' },
    { path: '/baby-care', icon: Baby, label: 'Baby Care' },
    { path: '/toddler-care', icon: Footprints, label: 'Toddler Care' },
    { path: '/preteen-care', icon: Backpack, label: 'Pre-Teen Care' },
  ]},
  { type: 'group', label: 'Tools', icon: Wrench, children: [
    { path: '/tasks', icon: ClipboardList, label: 'Tasks' },
    { path: '/journal', icon: BookOpen, label: 'Journal' },
  ]},
  { type: 'link', path: '/wellness', icon: Heart, label: 'Wellness' },
  { type: 'link', path: '/settings', icon: SettingsIcon, label: 'Settings' },
];

const mobileBottomNav = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/family', icon: Users, label: 'Family' },
  { path: '/tasks', icon: ClipboardList, label: 'Tasks' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/wellness', icon: Heart, label: 'Wellness' },
];

function NavList({ expandedGroups, toggleGroup, onNavigate }) {
  const location = useLocation();
  return navStructure.map(item => {
    if (item.type === 'link') {
      const isActive = location.pathname === item.path;
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
            isActive 
              ? 'bg-primary text-primary-foreground shadow-md' 
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <item.icon className="w-5 h-5" />
          {item.label}
        </Link>
      );
    }
    const isExpanded = expandedGroups[item.label];
    const hasActiveChild = item.children.some(child => 
      location.pathname === child.path || location.pathname.startsWith(child.path + '/')
    );
    return (
      <div key={item.label}>
        <button
          onClick={() => toggleGroup(item.label)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full ${
            hasActiveChild
              ? 'text-primary' 
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <item.icon className="w-5 h-5" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1 mb-1 space-y-0.5 border-l border-border pl-2">
            {item.children.map(child => {
              const isActive = location.pathname === child.path || location.pathname.startsWith(child.path + '/');
              return (
                <Link
                  key={child.path}
                  to={child.path}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    isActive 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <child.icon className="w-4 h-4" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  });
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({ Family: true, Tools: true });

  useEffect(() => { base44.auth.me().then(u => setCurrentUser(u)).catch(() => {}); }, []);

  // Auto-expand group containing the active route
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = { ...prev };
      navStructure.forEach(item => {
        if (item.type === 'group') {
          const hasActive = item.children.some(child => 
            location.pathname === child.path || location.pathname.startsWith(child.path + '/')
          );
          if (hasActive) next[item.label] = true;
        }
      });
      return next;
    });
  }, [location.pathname]);

  const toggleGroup = (label) => setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      {currentUser && <OneSignalInit user={currentUser} />}
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card fixed h-full z-30">
        <div className="p-6 border-b border-border">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">GenCare</h1>
              <p className="text-xs text-muted-foreground">Family Care Hub</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavList expandedGroups={expandedGroups} toggleGroup={toggleGroup} />
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground w-full transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border flex items-center justify-between px-4 z-40">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Heart className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading text-lg font-bold">GenCare</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-card shadow-xl p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Heart className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold">GenCare</h1>
                <p className="text-xs text-muted-foreground">Family Care Hub</p>
              </div>
            </div>
            <nav className="space-y-1">
              <NavList expandedGroups={expandedGroups} toggleGroup={toggleGroup} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen min-w-0 overflow-x-hidden">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 px-2 z-40">
        {mobileBottomNav.map(item => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <QuickCaptureButton />
    </div>
  );
}
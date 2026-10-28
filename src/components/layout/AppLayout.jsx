import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Pill, CalendarDays,
  ClipboardList, BookOpen, MessageCircle, Menu, X,
  Heart, LogOut, Settings as SettingsIcon, ChevronDown, Wrench, HeartHandshake, Mic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import QuickCaptureButton from '@/components/shared/QuickCaptureButton';
import OneSignalInit from '@/components/shared/OneSignalInit';
import RecordingBar from '@/components/shared/RecordingBar';
import AppUpdateCard from '@/components/shared/AppUpdateCard';
import NotificationsOffBanner from '@/components/shared/NotificationsOffBanner';
import PullToRefresh from '@/components/shared/PullToRefresh';
import FamilyGate from '@/components/family/FamilyGate';
import { FamilyProvider, useFamily } from '@/lib/family';
import { syncOnOpen } from '@/lib/calendarSync';
import { isNativeApp, plugin, waitForPlugin } from '@/lib/phone';

function buildNavStructure(members, canRecord) {
  return [
    { type: 'link', path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { type: 'group', label: 'Family', icon: Users, children: [
      { path: '/family', icon: Users, label: 'Family Members' },
      { path: '/messages', icon: MessageCircle, label: 'Messages' },
      { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
      { path: '/medications', icon: Pill, label: 'Medications' },
      { path: '/care-log', icon: HeartHandshake, label: 'Care Log' },
    ]},
    { type: 'group', label: 'Tools', icon: Wrench, children: [
      { path: '/tasks', icon: ClipboardList, label: 'Tasks' },
      { path: '/journal', icon: BookOpen, label: 'Journal' },
      { path: '/notes', icon: Mic, label: canRecord ? 'Record Notes' : 'Notes' },
    ]},
    { type: 'link', path: '/wellness', icon: Heart, label: 'Wellness' },
    { type: 'link', path: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];
}

const mobileBottomNav = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/family', icon: Users, label: 'Family' },
  { path: '/tasks', icon: ClipboardList, label: 'Tasks' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/wellness', icon: Heart, label: 'Wellness' },
];

function NavList({ items, expandedGroups, toggleGroup, onNavigate }) {
  const location = useLocation();
  return items.map(item => {
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
  return (
    <FamilyProvider>
      <FamilyGate>
        <AppShell />
      </FamilyGate>
    </FamilyProvider>
  );
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { me, refresh: refreshFamily } = useFamily();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({ Family: true, Tools: true });
  const [canRecord, setCanRecord] = useState(() => !!plugin('RecorderBridge'));

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const navStructure = useMemo(() => buildNavStructure(members, canRecord), [members, canRecord]);

  useEffect(() => { base44.auth.me().then(u => setCurrentUser(u)).catch(() => {}); }, []);

  // Record Notes only exists on app builds with the recorder.
  useEffect(() => {
    if (canRecord || !isNativeApp()) return;
    waitForPlugin('RecorderBridge', 10000).then((p) => { if (p) setCanRecord(true); });
  }, [canRecord]);

  // Phone calendars: tell the phone what to watch, and sync on every open / return.
  useEffect(() => {
    if (!me) return undefined;
    syncOnOpen(me);
    const onVisible = () => { if (document.visibilityState === 'visible') syncOnOpen(me); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [me]);

  // Android back button: go back in the app, or close the menu; leave the app
  // only from the home screen (the @capacitor/app plugin owns the button).
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let handle = null;
    (async () => {
      const App = await waitForPlugin('App', 8000);
      if (!App?.addListener) return;
      handle = await App.addListener('backButton', () => {
        if (mobileOpen) { setMobileOpen(false); return; }
        if (window.location.pathname === '/' || window.history.length <= 1) App.exitApp?.();
        else navigate(-1);
      });
    })();
    return () => { handle?.remove?.(); };
  }, [mobileOpen, navigate]);

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
  }, [location.pathname, navStructure]);

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
          <NavList items={navStructure} expandedGroups={expandedGroups} toggleGroup={toggleGroup} />
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
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-card border-b border-border z-40">
      <div className="h-16 flex items-center justify-between px-4">
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
      <RecordingBar />
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
              <NavList items={navStructure} expandedGroups={expandedGroups} toggleGroup={toggleGroup} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen min-w-0 overflow-x-hidden">
        <AppUpdateCard />
        <NotificationsOffBanner />
        <PullToRefresh onRefresh={async () => { await Promise.all([queryClient.invalidateQueries(), refreshFamily()]); }}>
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </PullToRefresh>
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
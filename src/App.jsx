import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Family from '@/pages/Family';
import FamilyMemberDetail from '@/pages/FamilyMemberDetail';
import Reminders from '@/pages/Reminders';
import CalendarPage from '@/pages/CalendarPage';
import Tasks from '@/pages/Tasks';
import CareLogPage from '@/pages/CareLogPage';
import Messages from '@/pages/Messages';
import Wellness from '@/pages/Wellness';
import Resources from '@/pages/Resources';
import JoinPage from '@/pages/JoinPage';
import Activity from '@/pages/Activity';
import Settings from '@/pages/Settings';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import AccountManagement from '@/pages/AccountManagement';
import Notes from '@/pages/Notes';
import Subscribe from '@/pages/Subscribe';
import FamilySettings from '@/pages/FamilySettings';
import Terms from '@/pages/Terms';
import DeleteAccount from '@/pages/DeleteAccount';

/** Pages anyone can open without signing in (the app stores link to them). */
const PUBLIC_PATHS = ['/privacy-policy', '/terms', '/delete-account'];

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading GenCare...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !PUBLIC_PATHS.includes(window.location.pathname.replace(/\/$/, ''))) {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join" element={<JoinPage />} />
      {/* Public, no sign-in: the app stores link to these */}
      <Route path="/privacy-policy" element={<PublicPage><PrivacyPolicy /></PublicPage>} />
      <Route path="/terms" element={<PublicPage><Terms /></PublicPage>} />
      <Route path="/delete-account" element={<PublicPage><DeleteAccount /></PublicPage>} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/family" element={<Family />} />
          <Route path="/family/:id" element={<FamilyMemberDetail />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/medications" element={<Navigate to="/tasks?tab=reminders" replace />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/todo" element={<Navigate to="/tasks" replace />} />
          <Route path="/checklists" element={<Navigate to="/tasks" replace />} />
          {/* Journal hidden Oct 29 2026 (page code kept in pages/Journal.jsx). */}
          <Route path="/journal" element={<Navigate to="/" replace />} />
          <Route path="/care-log" element={<CareLogPage />} />
          {/* The six age pages became one per-person Care Log. */}
          {['/baby-care', '/toddler-care', '/school-age-care', '/preteen-care', '/teen-management', '/senior-care'].map((p) => (
            <Route key={p} path={p} element={<Navigate to="/care-log" replace />} />
          ))}
          <Route path="/messages" element={<Messages />} />
          <Route path="/wellness" element={<Wellness />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/family-settings" element={<FamilySettings />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/account-management" element={<AccountManagement />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

/** A plain page for people who are not signed in (the Play Store and App Store link here). */
function PublicPage({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
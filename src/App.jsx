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
import Medications from '@/pages/Medications';
import CalendarPage from '@/pages/CalendarPage';
import Tasks from '@/pages/Tasks';
import Checklists from '@/pages/Checklists';
import Journal from '@/pages/Journal';
import BabyCare from '@/pages/BabyCare';
import ToddlerCare from '@/pages/ToddlerCare';
import Messages from '@/pages/Messages';
import Wellness from '@/pages/Wellness';
import JoinPage from '@/pages/JoinPage';
import Settings from '@/pages/Settings';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import AccountManagement from '@/pages/AccountManagement';

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
    } else if (authError.type === 'auth_required') {
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
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/family" element={<Family />} />
          <Route path="/family/:id" element={<FamilyMemberDetail />} />
          <Route path="/medications" element={<Medications />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/baby-care" element={<BabyCare />} />
          <Route path="/toddler-care" element={<ToddlerCare />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/wellness" element={<Wellness />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/account-management" element={<AccountManagement />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

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
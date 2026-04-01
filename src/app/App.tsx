import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import { AppProvider, useApp } from '@/context/AppContext';
import { Login } from './components/Login';
import { AuthCallback } from './components/AuthCallback';
import { OAuthSignupConfirmation } from './components/OAuthSignupConfirmation';
import { RoleSelection } from './components/RoleSelection';
import { SignUp } from './components/SignUp';
import { ForgotPassword } from './components/ForgotPassword';
import { TermsOfService } from './components/TermsOfService';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DashboardDesign } from './components/DashboardDesign';
import { BookingInterface } from './components/BookingInterface';
import { BookingPayment } from './components/BookingPayment';
import { MyBookings } from './components/MyBookings';
import { BookingHistoryView } from './components/BookingHistoryView';
import { CourtManagementView } from './components/CourtManagementView';
import { Reports } from './components/Reports';
import { ProfileSettings } from './components/ProfileSettings';
import Pricing from './components/Pricing';
import { CheckIn } from './components/CheckIn';
import { UserPortalView } from './components/UserPortalView';
import { CoachPortalView } from './components/CoachPortalView';
import { CoachProfileView } from './components/CoachProfileView';
import { NotificationsView } from './components/NotificationsView';
import { UserManagementView } from './components/UserManagementView';
import { SettingsView } from './components/SettingsView';
import { PaymentHistory } from './components/PaymentHistory';
import { CoachSessions } from './components/CoachSessions';
import { PendingBookings } from './components/PendingBookings';
import { HireCoachView } from './components/HireCoachView';

const ACCOUNT_CREATED_NOTICE_KEY = 'ventra_account_created_notice';
type AppRole = 'admin' | 'staff' | 'coach' | 'player';

function RequireRole({ allow, children }: { allow: AppRole[]; children: JSX.Element }) {
  const { currentUser, bootstrapped } = useApp();
  const location = useLocation();
  const allowed = Boolean(currentUser && allow.includes(currentUser.role as AppRole));
  const toastKey = useMemo(() => `ventra_role_denied:${location.pathname}`, [location.pathname]);

  useEffect(() => {
    if (!currentUser) return;
    if (allowed) return;
    if (sessionStorage.getItem(toastKey) === '1') return;
    sessionStorage.setItem(toastKey, '1');
    toast.error('Access denied for your account role.');
  }, [allowed, currentUser, toastKey]);

  if (!currentUser && !bootstrapped) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-slate-600 dark:text-slate-300">
        Loading...
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function DashboardLayout() {
  const { currentUser, bootstrapped } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingOauthConfirmation = localStorage.getItem('ventra_oauth_confirmation_pending');

  useEffect(() => {
    if (!currentUser) return;
    const notice = localStorage.getItem(ACCOUNT_CREATED_NOTICE_KEY);
    if (!notice) return;
    toast.success(notice);
    localStorage.removeItem(ACCOUNT_CREATED_NOTICE_KEY);
  }, [currentUser]);

  if (!currentUser && !bootstrapped) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-slate-600 dark:text-slate-300">
        Loading...
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (pendingOauthConfirmation && pendingOauthConfirmation === currentUser.email.toLowerCase()) {
    return <Navigate to="/auth/confirm" replace />;
  }

  const currentView = location.pathname.split('/')[1] || 'dashboard';

  const handleViewChange = (view: string) => {
    navigate(`/${view}`);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Sidebar 
        currentView={currentView} 
        onViewChange={handleViewChange} 
        role={currentUser.role as any} 
      />
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <Outlet />
      </main>
    </div>
  );
}

function DashboardHome() {
  const { currentUser } = useApp();
  if (currentUser?.role === 'admin' || currentUser?.role === 'staff') return <DashboardView />;
  if (currentUser?.role === 'coach') return <CoachProfileView />;
  return <UserPortalView />;
}

function ProfileEntry() {
  const { currentUser } = useApp();
  if (currentUser?.role === 'admin') return <UserPortalView />;
  if (currentUser?.role === 'staff') return <ProfileSettings />;
  if (currentUser?.role === 'coach') return <CoachProfileView />;
  return <UserPortalView />;
}

function DashboardEntry() {
  const { currentUser } = useApp();
  if (currentUser?.role === 'admin' || currentUser?.role === 'staff') return <DashboardView />;
  if (currentUser?.role === 'coach') return <CoachPortalView />;
  return <DashboardDesign />;
}

function PricingEntry() {
  const { currentUser } = useApp();
  if (currentUser?.role === 'player') return <Navigate to="/dashboard" replace />;
  return <Pricing />;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/quick-booking" element={<BookingInterface initialMode="quick" quickOnly />} />
            <Route path="/login" element={<RoleSelection />} />
            <Route path="/sign-in" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/confirm" element={<OAuthSignupConfirmation />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardEntry />} />
              <Route
                path="/booking"
                element={
                  <RequireRole allow={['player', 'coach']}>
                    <BookingInterface />
                  </RequireRole>
                }
              />
              <Route
                path="/booking/payment"
                element={
                  <RequireRole allow={['player', 'coach']}>
                    <BookingPayment />
                  </RequireRole>
                }
              />
              <Route
                path="/my-bookings"
                element={
                  <RequireRole allow={['player', 'coach']}>
                    <MyBookings />
                  </RequireRole>
                }
              />
              <Route
                path="/history"
                element={
                  <RequireRole allow={['player', 'coach']}>
                    <BookingHistoryView />
                  </RequireRole>
                }
              />
              <Route
                path="/court-mgmt"
                element={
                  <RequireRole allow={['admin', 'staff']}>
                    <CourtManagementView />
                  </RequireRole>
                }
              />
              <Route
                path="/analytics"
                element={
                  <RequireRole allow={['admin']}>
                    <Reports />
                  </RequireRole>
                }
              />
              <Route
                path="/requests"
                element={
                  <RequireRole allow={['admin', 'staff']}>
                    <PendingBookings />
                  </RequireRole>
                }
              />
              <Route path="/profile" element={<ProfileEntry />} />
              <Route path="/profile-settings" element={<ProfileSettings />} />
              <Route path="/notifications" element={<NotificationsView />} />
              <Route path="/pricing" element={<PricingEntry />} />
              <Route
                path="/users"
                element={
                  <RequireRole allow={['admin', 'staff']}>
                    <UserManagementView />
                  </RequireRole>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireRole allow={['admin']}>
                    <SettingsView />
                  </RequireRole>
                }
              />
              <Route
                path="/billing"
                element={
                  <RequireRole allow={['player', 'coach']}>
                    <PaymentHistory />
                  </RequireRole>
                }
              />
              <Route
                path="/coach-sessions"
                element={
                  <RequireRole allow={['coach']}>
                    <CoachSessions />
                  </RequireRole>
                }
              />
              <Route
                path="/hire-coach"
                element={
                  <RequireRole allow={['player']}>
                    <HireCoachView />
                  </RequireRole>
                }
              />
            </Route>

            <Route path="/check-in" element={<CheckIn />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </AppProvider>
    </ThemeProvider>
  );
}


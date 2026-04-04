import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  LayoutDashboard, 
  Calendar, 
  Settings, 
  Users, 
  BarChart3, 
  History, 
  UserCircle,
  LogOut,
  Dribbble,
  CreditCard,
  Moon,
  Sun,
  Bell,
  Receipt,
  ClipboardList,
  ListChecks,
  UserRoundPlus,
  X
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useTheme } from 'next-themes';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  role: 'admin' | 'staff' | 'coach' | 'player';
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ currentView, onViewChange, role, isOpen = false, onClose }: SidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { unreadNotificationCount, currentUser, logout, bookings, getCoachVerificationQueue } = useApp();
  const navigate = useNavigate();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const isPaymentFlowActive = React.useMemo(() => {
    try {
      const recent = Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
      const pendingStart = Number(sessionStorage.getItem('ventra_payment_pending_started_at') || 0);
      const pendingIdsRaw = sessionStorage.getItem('ventra_payment_pending_booking_ids');
      const pendingIds = pendingIdsRaw ? JSON.parse(pendingIdsRaw) : [];
      const hasPending = Array.isArray(pendingIds) && pendingIds.length > 0;
      const recentActive = Boolean(recent && Date.now() - recent < 15_000);
      const pendingActive = hasPending && (!pendingStart || Date.now() - pendingStart < 30 * 60 * 1000);
      return recentActive || pendingActive;
    } catch {
      return false;
    }
  }, []);
  const [unreadCount, setUnreadCount] = React.useState(() => unreadNotificationCount);
  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const [pendingCoachApprovals, setPendingCoachApprovals] = React.useState(0);
  const lastCoachToastKey = 'ventra_admin_pending_coach_count';

  React.useEffect(() => {
    if (role !== 'admin' && role !== 'staff') return;
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await getCoachVerificationQueue({ status: 'pending' });
        const nextCount = Array.isArray(rows) ? rows.length : 0;
        if (cancelled) return;
        setPendingCoachApprovals(nextCount);

        const prevRaw = sessionStorage.getItem(lastCoachToastKey);
        const prev = prevRaw ? Number(prevRaw) : 0;
        if (Number.isFinite(prev) && nextCount > prev && prev >= 0) {
          toast.info(`${nextCount} coach application(s) pending review.`);
        }
        sessionStorage.setItem(lastCoachToastKey, String(nextCount));
      } catch {
        // ignore background errors
      }
    };

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [getCoachVerificationQueue, role]);

  React.useEffect(() => {
    const dropDelayMs = isPaymentFlowActive ? 8000 : 600;
    if (unreadNotificationCount > 0) {
      setUnreadCount(unreadNotificationCount);
      return;
    }
    const timeout = window.setTimeout(() => setUnreadCount(0), dropDelayMs);
    return () => window.clearTimeout(timeout);
  }, [unreadNotificationCount, isPaymentFlowActive]);

  const handleConfirmLogout = () => {
    logout();
    navigate('/login');
    setIsLogoutConfirmOpen(false);
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff', 'coach', 'player'] },
    { id: 'requests', label: 'Requests', icon: ListChecks, roles: ['admin', 'staff'] },
    { id: 'booking', label: 'Book a Court', icon: Calendar, roles: ['coach', 'player'] },
    { id: 'my-bookings', label: 'My Reservation', icon: Calendar, roles: ['player', 'coach'] },
    { id: 'history', label: 'History', icon: History, roles: ['player', 'coach'] },
    { id: 'hire-coach', label: 'Hire a Coach', icon: UserRoundPlus, roles: ['player'] },
    { id: 'coach-sessions', label: 'My Sessions', icon: ClipboardList, roles: ['coach'] },
    { id: 'court-mgmt', label: 'Courts', icon: Dribbble, roles: ['admin', 'staff'] },
    { id: 'users', label: 'Players', icon: Users, roles: ['admin', 'staff'] },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin'] },
    { id: 'notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'staff', 'coach', 'player'] },
    { id: 'profile', label: 'Profile', icon: UserCircle, roles: ['admin', 'staff', 'coach', 'player'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin'] },
    { id: 'billing', label: 'Billing', icon: Receipt, roles: ['player', 'coach'] },
    { id: 'pricing', label: 'Pricing', icon: CreditCard, roles: ['admin', 'staff', 'coach'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(role));

  const handleNavClick = (id: string) => {
    onViewChange(id);
    onClose?.();
  };

  const sidebarContent = (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full flex flex-col overflow-hidden">
      <div className="p-6 flex items-center justify-between">
        <img src="/ventra-logo.png" alt="Ventra" className="h-20 w-auto" />
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          if (item.id === 'notifications') {
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick('notifications')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative",
                  isActive
                    ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50"
                )}
              >
                <Icon size={20} />
                {item.label}
                {unreadCount > 0 && (
                  <span className="absolute right-3 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative",
                isActive 
                  ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400" 
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50"
              )}
            >
              <Icon size={20} />
              {item.label}
              {item.id === 'requests' && pendingCount > 0 && (
                <span className="absolute right-3 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                  {pendingCount}
                </span>
              )}
              {item.id === 'users' && (role === 'admin' || role === 'staff') && pendingCoachApprovals > 0 && (
                <span className="absolute right-3 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                  {pendingCoachApprovals}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 shrink-0 bg-slate-50 dark:bg-slate-900">
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>

        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-teal-700 dark:text-teal-400 font-bold shrink-0">
            {role.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{currentUser?.name || 'User'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{role}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsLogoutConfirmOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — fixed on large screens */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:w-64 z-30">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — overlay drawer */}
      {createPortal(
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
              isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div
            className={cn(
              "fixed left-0 top-0 h-full w-72 max-w-[85vw] z-50 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden",
              isOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            {sidebarContent}
          </div>
        </>,
        document.body
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Sign Out</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Are you sure you want to sign out of your account?</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

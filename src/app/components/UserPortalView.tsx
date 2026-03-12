import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { Booking, Notification } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CreditCard,
  User,
  Settings,
  Bell,
  Award,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function UserPortalView() {
  const { currentUser, notifications, userSubscription, memberships, bookings, courts, cancelSubscription } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';

  const recentlyFromPayment = useMemo(() => {
    try {
      const ts = Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
      return Boolean(ts && Date.now() - ts < 15_000);
    } catch {
      return false;
    }
  }, []);

  const myNotifications = useMemo(
    () => notifications.filter((n) => n.userId === currentUser?.id),
    [notifications, currentUser?.id],
  );
  const activePlan = userSubscription ? memberships.find((m) => m.id === userSubscription.membership_id) : null;

  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const nextBooking = useMemo(() => {
    return bookings
      .filter((b) => {
        const isUpcomingConfirmed = b.status === 'confirmed' && new Date(b.date) >= new Date();
        if (!isUpcomingConfirmed) return false;
        return isAdmin ? true : b.userId === currentUser?.id;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }, [bookings, isAdmin, currentUser?.id]);

  const [visibleNotifications, setVisibleNotifications] = useState<Notification[]>(() => myNotifications as Notification[]);
  const [visibleNextBooking, setVisibleNextBooking] = useState<Booking | undefined>(() => nextBooking as Booking | undefined);

  useEffect(() => {
    const emptyDelayMs = recentlyFromPayment ? 8000 : 600;
    if (myNotifications.length > 0) {
      setVisibleNotifications(myNotifications as Notification[]);
      return;
    }
    const timeout = window.setTimeout(() => setVisibleNotifications([]), emptyDelayMs);
    return () => window.clearTimeout(timeout);
  }, [myNotifications, recentlyFromPayment]);

  useEffect(() => {
    const emptyDelayMs = recentlyFromPayment ? 8000 : 600;
    if (nextBooking) {
      setVisibleNextBooking(nextBooking as Booking);
      return;
    }
    const timeout = window.setTimeout(() => setVisibleNextBooking(undefined), emptyDelayMs);
    return () => window.clearTimeout(timeout);
  }, [nextBooking, recentlyFromPayment]);

  const nextCourt = visibleNextBooking ? courts.find((c) => c.id === visibleNextBooking.courtId) : null;

  const handleReschedule = () => {
    if (isAdmin) {
      navigate('/requests');
      return;
    }

    toast.info('To reschedule, please cancel this booking and book a new slot.', {
      action: {
        label: 'Go to Bookings',
        onClick: () => navigate('/my-bookings'),
      },
    });
    navigate('/my-bookings');
  };

  const handleCancelMembership = async () => {
    if (!userSubscription?.id) return;
    if (!confirm('Cancel your active membership subscription?')) return;
    try {
      await cancelSubscription(userSubscription.id);
      toast.success('Subscription cancelled.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to cancel subscription.');
    }
  };

  return (
    <div className="min-h-screen bg-transparent p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/3 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-3xl font-bold text-teal-700 dark:text-teal-300 overflow-hidden">
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="absolute bottom-0 right-0 p-1.5 bg-teal-600 rounded-full border-4 border-white dark:border-slate-900 text-white">
                  <Award size={14} />
                </div>
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{displayName}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {isAdmin
                  ? 'Administrator Account'
                  : userSubscription
                    ? `Member since ${new Date(userSubscription.start_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                    : 'Free Member'}
              </p>

              <div className="flex gap-4 mt-6 w-full">
                <div className="flex-1 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">{isAdmin ? 'Role' : 'Skill Level'}</p>
                  <p className="font-bold text-teal-600 dark:text-teal-400 capitalize">
                    {isAdmin ? 'Administrator' : (currentUser?.skillLevel || 'beginner')}
                  </p>
                </div>
                <div className="flex-1 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">{isAdmin ? 'Access' : 'Current Plan'}</p>
                  <p className="font-bold text-teal-600 dark:text-teal-400">{isAdmin ? 'Full Access' : (activePlan?.name || 'Free Tier')}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <button
                onClick={() => navigate('/profile-settings')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-medium text-sm"
              >
                <div className="flex items-center gap-3">
                  <User size={18} /> Profile Details
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" />
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-medium text-sm">
                <div className="flex items-center gap-3">
                  <Settings size={18} /> {isAdmin ? 'Admin Preferences' : 'Preferences'}
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" />
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-medium text-sm">
                <div className="flex items-center gap-3">
                  <CreditCard size={18} /> {isAdmin ? 'System Access' : 'Billing & Payment'}
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" />
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-medium text-sm">
                <div className="flex items-center gap-3">
                  <Bell size={18} /> Notifications
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" />
              </button>
              {!isAdmin && userSubscription?.status === 'active' && (
                <button
                  onClick={() => void handleCancelMembership()}
                  className="w-full p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors font-medium text-sm"
                >
                  Cancel Membership
                </button>
              )}
            </div>
          </div>

          <div className="bg-teal-600 dark:bg-teal-700 p-6 rounded-2xl text-white shadow-lg shadow-teal-100 dark:shadow-none relative overflow-hidden">
            <h3 className="font-bold text-lg mb-2">{isAdmin ? 'Admin Controls' : 'Upgrade to Pro'}</h3>
            <p className="text-teal-100 text-xs mb-4">
              {isAdmin
                ? 'Manage users, court operations, pricing, and reports from your admin tools.'
                : 'Get 20% off all bookings and early access to court reservations.'}
            </p>
            <button
              onClick={() => navigate(isAdmin ? '/settings' : '/pricing')}
              className="w-full bg-white text-teal-600 py-2.5 rounded-xl font-bold text-sm hover:bg-teal-50 transition-colors"
            >
              {isAdmin ? 'Open Admin Settings' : 'View Membership Plans'}
            </button>
          </div>
        </div>

        <div className="lg:flex-1 space-y-8">
          {visibleNotifications.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Bell className="text-teal-600" size={20} />
                Recent Notifications
              </h3>
              <div className="space-y-3">
                {visibleNotifications.map((n) => (
                  <div key={n.id} className="p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 rounded-xl flex items-start gap-3 border border-amber-100 dark:border-amber-900/40">
                    <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-bold text-sm">{n.title}</p>
                      <p className="text-sm opacity-90">{n.message}</p>
                      <p className="text-xs text-amber-700/60 dark:text-amber-300/70 mt-1">{n.createdAt.toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleNextBooking ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-8">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                <QRCode value={visibleNextBooking.id} size={120} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="inline-block px-3 py-1 bg-teal-50 text-teal-600 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2">
                  {isAdmin ? 'Next Managed Booking' : 'Next Session'}
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {nextCourt?.name || 'Unknown Court'}
                  {nextCourt?.type ? ` - ${nextCourt.type.charAt(0).toUpperCase()}${nextCourt.type.slice(1)}` : ''}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium">{format(new Date(visibleNextBooking.date), 'EEEE, MMM dd')} at {visibleNextBooking.startTime}</p>
                <div className="flex flex-wrap gap-4 mt-6 justify-center md:justify-start">
                  <button
                    onClick={() => navigate('/check-in', { state: { from: `${location.pathname}${location.search}` } })}
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-teal-700 transition-colors"
                  >
                    Check-in Now
                  </button>
                  <button
                    onClick={handleReschedule}
                    className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {isAdmin ? 'Open Requests' : 'Reschedule'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="text-slate-400 dark:text-slate-500" size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{isAdmin ? 'No Upcoming Managed Bookings' : 'No Upcoming Sessions'}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                {isAdmin ? 'No confirmed bookings are scheduled right now.' : "You don't have any active bookings scheduled."}
              </p>
              <button
                onClick={() => navigate(isAdmin ? '/requests' : '/booking')}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-teal-700 transition-colors"
              >
                {isAdmin ? 'Go to Requests' : 'Book a Court'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

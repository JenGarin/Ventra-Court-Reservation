import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Bell, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Notification } from '@/types';
import { toast } from 'sonner';

export function NotificationsView() {
  const { currentUser, notifications, markAllNotificationsAsRead, markNotificationAsRead, unreadNotificationCount } = useApp();
  const [viewMode, setViewMode] = useState<'recent' | 'all'>('recent');
  
  const recentlyFromPayment = useMemo(() => {
    try {
      const ts = Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
      return Boolean(ts && Date.now() - ts < 15_000);
    } catch {
      return false;
    }
  }, []);

  const myNotifications = useMemo(() => {
    return notifications
      .filter((n: Notification) => n.userId === currentUser?.id)
      .sort((a: Notification, b: Notification) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [notifications, currentUser?.id]);

  const [visibleNotifications, setVisibleNotifications] = useState<Notification[]>(() => myNotifications);

  useEffect(() => {
    const emptyDelayMs = recentlyFromPayment ? 8000 : 600;
    if (myNotifications.length > 0) {
      setVisibleNotifications(myNotifications);
      return;
    }
    const timeout = window.setTimeout(() => setVisibleNotifications([]), emptyDelayMs);
    return () => window.clearTimeout(timeout);
  }, [myNotifications, recentlyFromPayment]);

  const visibleUnreadCount = useMemo(() => visibleNotifications.filter((n) => !n.read).length, [visibleNotifications]);

  const displayedNotifications = viewMode === 'recent' ? visibleNotifications.slice(0, 5) : visibleNotifications;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      toast.success('All notifications marked as read.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to mark notifications as read.');
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to mark notification as read.');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'error': return <XCircle className="w-6 h-6 text-rose-600" />;
      default: return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case 'success': return 'bg-emerald-50 border-emerald-100 text-emerald-900';
      case 'warning': return 'bg-amber-50 border-amber-100 text-amber-900';
      case 'error': return 'bg-rose-50 border-rose-100 text-rose-900';
      default: return 'bg-blue-50 border-blue-100 text-blue-900';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 animate-in fade-in duration-500">
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          <p className="text-slate-500 dark:text-slate-400">Stay updated with your latest activities.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="font-bold text-slate-900 dark:text-white">{visibleNotifications.length}</span>
            <span className="text-slate-500 dark:text-slate-400 ml-2">Total</span>
          </div>
          {(visibleUnreadCount || unreadNotificationCount) > 0 && (
            <button
              onClick={() => void handleMarkAllRead()}
              className="px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('recent')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'recent'
              ? 'bg-teal-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
          }`}
        >
          Recent
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'all'
              ? 'bg-teal-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
          }`}
        >
          View All Notifications
        </button>
      </div>

      <div className="space-y-4">
        {displayedNotifications.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">No notifications yet</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-2">
              We'll notify you when your bookings are confirmed, cancelled, or when there are important updates.
            </p>
          </div>
        ) : (
          displayedNotifications.map((notification: Notification) => (
            <div 
              key={notification.id} 
              className={`p-6 rounded-2xl border flex gap-4 transition-all hover:shadow-md ${getStyles(notification.type)}`}
            >
              <div className="shrink-0 mt-1">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-4">
                  <h3 className="font-bold text-lg">{notification.title}</h3>
                  <div className="flex items-center gap-2">
                    {!notification.read && (
                      <button
                        onClick={() => void handleMarkRead(notification.id)}
                        className="text-xs font-semibold px-2 py-1 rounded-md bg-white/70 hover:bg-white text-slate-700 transition-colors"
                      >
                        Mark read
                      </button>
                    )}
                    <span className="text-xs font-medium opacity-70 whitespace-nowrap">
                      {format(notification.createdAt, 'MMM dd, HH:mm')}
                    </span>
                  </div>
                </div>
                <p className="mt-1 opacity-90 leading-relaxed">{notification.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}

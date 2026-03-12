// Dashboard role-based summary:
//
// Admin & Staff: Manage courts, bookings, analytics, and system settings.
// Player: Book courts, view bookings, and manage their profile.
// Coach: Book courts for training, manage sessions, and view their schedule.

import { useApp } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut,
  TrendingUp,
  PhilippinePeso,
  MapPin,
  CheckCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import React, { useEffect, useState } from 'react';
import { BookingAnalytics } from '@/types';
import { LogOut as LogOutIcon } from 'react-icons/log-out';
import { Plus } from 'react-icons/plus';

export function Dashboard() {
  const { currentUser, logout, bookings, courts, getBookingAnalytics } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const myBookings = bookings.filter(b => b.userId === currentUser?.id && b.status !== 'cancelled');
  const upcomingBookings = myBookings.filter(b => b.date >= new Date()).slice(0, 3);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const [monthlyAnalytics, setMonthlyAnalytics] = useState<BookingAnalytics>({
    totalBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    noShows: 0,
    noShowRate: 0,
    totalRevenue: 0,
    averageBookingValue: 0,
  });

  useEffect(() => {
    let active = true;
    getBookingAnalytics(monthStart, monthEnd)
      .then((data) => {
        if (!active) return;
        setMonthlyAnalytics(data);
      })
      .catch(() => {
        if (!active) return;
        setMonthlyAnalytics({
          totalBookings: 0,
          completedBookings: 0,
          cancelledBookings: 0,
          noShows: 0,
          noShowRate: 0,
          totalRevenue: 0,
          averageBookingValue: 0,
        });
      });
    return () => {
      active = false;
    };
  }, [getBookingAnalytics, monthStart, monthEnd]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'staff';

  const metrics = [
    { title: 'Total Revenue', value: '₱12,450', change: '+12.5%' },
    { title: 'Active Bookings', value: '42', change: '+8.2%' },
    { title: 'Court Utilization', value: '78%', change: '-2.4%' },
    { title: 'Total Players', value: '1,284', change: '+15.3%' },
  ];

  const upcomingSessions = [
    { player: 'Sarah Wilson', court: 'Court 3 (Indoor)', time: '14:00 - 15:30', type: 'Private' },
    { player: 'Mike Ross', court: 'Court 1 (Outdoor)', time: '15:00 - 16:00', type: 'Open Play' },
    { player: 'Emily Chen', court: 'Court 4 (Indoor)', time: '16:30 - 18:00', type: 'Coaching' },
    { player: 'David Smith', court: 'Court 2 (Outdoor)', time: '17:00 - 18:30', type: 'Private' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOutIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Metrics */}
        <div className="grid md:grid-cols-4 gap-4">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 flex flex-col items-center justify-center border border-transparent dark:border-slate-800"
            >
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{metric.title}</h2>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-200">{metric.value}</p>
              <span className="text-sm text-green-500">{metric.change}</span>
            </div>
          ))}
        </div>

        {/* Revenue & Utilization */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 border border-transparent dark:border-slate-800">
          <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Revenue & Utilization</h2>
          <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400">Graph Placeholder</div>
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 border border-transparent dark:border-slate-800">
          <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Upcoming Sessions</h2>
          <ul className="space-y-4">
            {upcomingSessions.map((session, index) => (
              <li
                key={index}
                className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 p-4 rounded-lg"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{session.player}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {session.court} - {session.time}
                  </p>
                </div>
                <span className="text-sm text-teal-600 dark:text-teal-400 font-semibold">
                  {session.type}
                </span>
              </li>
            ))}
          </ul>
          <button 
            onClick={() => navigate(currentUser?.role === 'admin' || currentUser?.role === 'staff' ? '/court-mgmt' : '/my-bookings')}
            className="w-full mt-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            View All Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
